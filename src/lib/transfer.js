// Export and import.
//
// Two formats, for two different jobs:
//   JSON — everything, including full purchase history. Backups and moving to
//          a different Firebase project.
//   CSV  — one row per item, opens in Excel/Sheets. For bulk edits: setting
//          target prices, reassigning bags, fixing quantities.
//
// Nothing here touches Firestore. An import is parsed, diffed into a plan, and
// shown to the user before a single write happens.

// Explicit extensions so this module also loads under plain Node, which is how
// the export/import round trip is tested.
import { itemQty } from './packing.js';
import { lastPurchase, toDateInput } from './dates.js';
import { waitPctOff, waitPriceFromPct } from './money.js';

export const SCHEMA = 'nomad-pack-list';
export const SCHEMA_VERSION = 1;

// ── Field lists ───────────────────────────────────────────────────

// Everything that defines an item, minus Firestore's server timestamps.
const ITEM_FIELDS = [
  'name', 'category', 'person', 'qty', 'status', 'inBag', 'condition',
  'estLifeMonths', 'targetPrice', 'waitPrice', 'notes', 'sortOrder', 'packedQty', 'wornQty', 'worn',
  'replaceQty',
];

const BAG_FIELDS = ['name', 'owner', 'emoji', 'order'];

// The CSV keeps only the most recent purchase — a spreadsheet can't hold a
// nested history, and the last price is what people actually want to edit.
export const ITEM_CSV_COLUMNS = [
  'id', 'name', 'category', 'person', 'qty', 'status', 'inBag', 'condition',
  'estLifeMonths', 'replaceQty', 'targetPrice', 'waitPctOff', 'waitPrice', 'notes',
  'lastPaidUSD', 'lastPaidDate', 'lastPaidCurrency', 'lastPaidLocal', 'lastPaidWhere',
];

export const BAG_CSV_COLUMNS = ['id', 'name', 'owner', 'emoji', 'order'];

// ── Export ────────────────────────────────────────────────────────

function cleanItem(item) {
  const out = { id: item.id };
  ITEM_FIELDS.forEach((f) => { if (item[f] !== undefined) out[f] = item[f]; });
  out.qty = itemQty(item);
  out.purchases = Array.isArray(item.purchases) ? item.purchases : [];
  return out;
}

function cleanBag(bag) {
  const out = { id: bag.id };
  BAG_FIELDS.forEach((f) => { if (bag[f] !== undefined) out[f] = bag[f]; });
  return out;
}

export function buildBackup({ items = [], bags = [], settings = {}, appVersion = 'unknown' }) {
  return {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    counts: { items: items.length, bags: bags.length },
    // Rates are refetched automatically; only the real preference travels.
    settings: { activeCurrency: settings.activeCurrency || 'USD' },
    bags: bags.map(cleanBag),
    items: items.map(cleanItem),
  };
}

export function itemsToCSV(items) {
  const rows = items.map((item) => {
    const paid = lastPurchase(item);
    return {
      id: item.id,
      name: item.name ?? '',
      category: item.category ?? '',
      person: item.person ?? '',
      qty: itemQty(item),
      status: item.status ?? '',
      inBag: item.inBag ?? '',
      condition: item.condition ?? '',
      estLifeMonths: item.estLifeMonths ?? '',
      replaceQty: item.replaceQty ?? '',
      targetPrice: item.targetPrice ?? '',
      // waitPrice is the stored value; the percentage is derived for readability
      // so the sheet shows both without two competing sources of truth.
      waitPctOff: waitPctOff(item.targetPrice, item.waitPrice) ?? '',
      waitPrice: item.waitPrice ?? '',
      notes: item.notes ?? '',
      lastPaidUSD: paid?.amountUSD ?? '',
      lastPaidDate: paid?.date ?? '',
      lastPaidCurrency: paid?.currency ?? '',
      lastPaidLocal: paid?.amountLocal ?? '',
      lastPaidWhere: paid?.where ?? '',
    };
  });
  return toCSV(ITEM_CSV_COLUMNS, rows);
}

export function bagsToCSV(bags) {
  return toCSV(BAG_CSV_COLUMNS, bags.map((b) => ({
    id: b.id, name: b.name ?? '', owner: b.owner ?? '', emoji: b.emoji ?? '', order: b.order ?? '',
  })));
}

// ── CSV ───────────────────────────────────────────────────────────

function escapeCSV(value) {
  const s = value === null || value === undefined ? '' : String(value);
  // Quote when the value could otherwise break the row, and double any quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCSV(columns, rows) {
  const lines = [columns.join(',')];
  rows.forEach((row) => lines.push(columns.map((c) => escapeCSV(row[c])).join(',')));
  return lines.join('\r\n');
}

/**
 * A real CSV parser — quoted fields can contain commas, newlines and escaped
 * quotes, all of which show up as soon as someone types a note in Excel.
 */
export function parseCSV(text) {
  const clean = text.replace(/^﻿/, '');   // strip Excel's BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    // Skip blank trailing lines.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < clean.length) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }

    field += ch; i++;
  }

  if (field !== '' || row.length > 0) endRow();
  if (rows.length === 0) return { header: [], rows: [] };

  const header = rows[0].map((h) => h.trim());
  const objects = rows.slice(1).map((cells) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });
    return obj;
  });

  return { header, rows: objects };
}

// ── Coercion ──────────────────────────────────────────────────────

function num(val, fallback = null) {
  if (val === '' || val === null || val === undefined) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function int(val, fallback) {
  const n = num(val, null);
  return n === null ? fallback : Math.max(0, Math.round(n));
}

function bool(val) {
  if (typeof val === 'boolean') return val;
  return ['true', 'yes', '1', 'y'].includes(String(val).trim().toLowerCase());
}

const VALID_STATUS    = ['have', 'buy', 'replace'];
const VALID_CONDITION = ['new', 'good', 'fair', 'poor'];
const VALID_PERSON    = ['Mike', 'Jen', 'Both'];

function pick(value, allowed, fallback) {
  const v = String(value ?? '').trim();
  const hit = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
  return hit || fallback;
}

// ── Parse an uploaded file ────────────────────────────────────────

/**
 * Works out what was dropped in and normalises it.
 * Returns { kind, items, bags, settings, warnings }.
 */
export function parseImportFile(text, filename = '') {
  const warnings = [];
  const trimmed = text.trim();

  // JSON backup
  if (trimmed.startsWith('{')) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    if (json.schema !== SCHEMA) {
      throw new Error('That JSON file was not exported from this app.');
    }
    if (json.schemaVersion > SCHEMA_VERSION) {
      warnings.push(`The file was written by a newer version of the app (schema ${json.schemaVersion}). Some fields may be ignored.`);
    }
    return {
      kind: 'json',
      items: (json.items || []).map(normalizeJsonItem),
      bags: (json.bags || []).map(normalizeJsonBag),
      settings: json.settings || null,
      warnings,
    };
  }

  // CSV — decide which sheet it is from the header.
  const { header, rows } = parseCSV(text);
  if (header.length === 0) throw new Error('That file appears to be empty.');

  const hasItemCols = header.includes('name') && (header.includes('category') || header.includes('targetPrice'));
  const hasBagCols  = header.includes('name') && header.includes('owner') && !header.includes('category');

  if (hasBagCols) {
    return { kind: 'bags-csv', items: [], bags: rows.map(normalizeCsvBag), settings: null, warnings };
  }
  if (hasItemCols) {
    const missing = ['name'].filter((c) => !header.includes(c));
    if (missing.length) throw new Error(`The CSV is missing required column(s): ${missing.join(', ')}`);
    const provided = ITEM_CSV_COLUMNS.filter((c) => header.includes(c));
    if (!header.includes('id') && !header.includes('person')) {
      warnings.push('No id or person column — rows are matched on name alone, and any duplicate name will be skipped.');
    }
    return {
      kind: 'items-csv',
      items: rows.map((r) => normalizeCsvItem(r, header)),
      bags: [],
      settings: null,
      providedColumns: provided,
      warnings,
    };
  }

  throw new Error(
    `Could not tell what this CSV contains. Item files need a "name" column plus "category" or "targetPrice"; bag files need "name" and "owner".`,
  );
}

function normalizeJsonItem(raw) {
  return {
    // A JSON backup is complete by definition, so every field is authoritative.
    _provided: [...COMPARED],
    id: raw.id || null,
    name: String(raw.name ?? '').trim(),
    category: String(raw.category ?? 'Other').trim(),
    person: pick(raw.person, VALID_PERSON, 'Both'),
    qty: int(raw.qty, 1) || 1,
    status: pick(raw.status, VALID_STATUS, 'have'),
    inBag: raw.inBag ? String(raw.inBag).trim() : null,
    condition: pick(raw.condition, VALID_CONDITION, 'good'),
    estLifeMonths: int(raw.estLifeMonths, 24) || 24,
    replaceQty: int(raw.replaceQty, 0),
    targetPrice: num(raw.targetPrice, null),
    waitPrice: num(raw.waitPrice, null),
    notes: String(raw.notes ?? ''),
    sortOrder: num(raw.sortOrder, null),
    packedQty: int(raw.packedQty, 0),
    wornQty: Number.isFinite(Number(raw.wornQty)) ? int(raw.wornQty, 0) : (bool(raw.worn) ? int(raw.qty, 1) : 0),
    worn: bool(raw.worn),
    purchases: Array.isArray(raw.purchases) ? raw.purchases : [],
  };
}

function normalizeJsonBag(raw) {
  return {
    id: raw.id || null,
    name: String(raw.name ?? '').trim(),
    owner: pick(raw.owner, VALID_PERSON, 'Both'),
    emoji: raw.emoji || '🎒',
    order: num(raw.order, 99),
  };
}

/**
 * `present` is the CSV's actual header. Only those columns become fields, so a
 * cut-down sheet (say just name + targetPrice) updates the price and leaves
 * category, bag, quantity and notes alone. Without this, every column absent
 * from the file would be overwritten with a default.
 */
function normalizeCsvItem(row, present = []) {
  const has = (col) => present.includes(col);

  const item = {
    id: row.id?.trim() || null,
    // Always needed: it's the fallback match key and the label everywhere.
    name: String(row.name ?? '').trim(),
    _provided: ['name'],
  };

  const set = (field, value) => { item[field] = value; item._provided.push(field); };

  if (has('category'))      set('category', String(row.category ?? '').trim() || 'Other');
  if (has('person'))        set('person', pick(row.person, VALID_PERSON, 'Both'));
  if (has('qty'))           set('qty', int(row.qty, 1) || 1);
  if (has('status'))        set('status', pick(row.status, VALID_STATUS, 'have'));
  if (has('inBag'))         set('inBag', row.inBag?.trim() ? row.inBag.trim() : null);
  if (has('condition'))     set('condition', pick(row.condition, VALID_CONDITION, 'good'));
  if (has('estLifeMonths')) set('estLifeMonths', int(row.estLifeMonths, 24) || 24);
  if (has('replaceQty'))    set('replaceQty', int(row.replaceQty, 0));
  if (has('targetPrice'))   set('targetPrice', num(row.targetPrice, null));
  if (has('notes'))         set('notes', String(row.notes ?? ''));

  // Accept either an explicit wait price or a percent-off column. The explicit
  // price wins — it's usually a real observed sale price, not a round number.
  const explicitWait = has('waitPrice') ? num(row.waitPrice, null) : null;
  const pctOff = has('waitPctOff') ? num(row.waitPctOff, null) : null;
  if (explicitWait !== null) {
    set('waitPrice', explicitWait);
  } else if (pctOff !== null) {
    const target = item.targetPrice ?? null;
    set('waitPrice', waitPriceFromPct(target, pctOff));
  }

  // Matching falls back to name+person, so a person is needed even when the
  // column is absent — it just isn't treated as an edit.
  if (!has('person')) item.person = 'Both';

  // A filled-in price becomes a purchase, if it isn't already recorded.
  const amountUSD = num(row.lastPaidUSD, null);
  if (amountUSD !== null && amountUSD >= 0) {
    const declared = String(row.lastPaidCurrency || 'USD').trim().toUpperCase() || 'USD';
    const local = num(row.lastPaidLocal, null);
    // Without a local amount there is no rate to derive. Defaulting it to the
    // USD figure recorded a foreign purchase at a rate of 1, which is exactly
    // the kind of quiet lie the stored-rate design exists to prevent — so log
    // it as a plain USD purchase and tell the user the currency was dropped.
    const hasLocal = declared !== 'USD' && local !== null && local > 0 && amountUSD > 0;
    item._csvPurchase = {
      date: String(row.lastPaidDate || '').trim() || toDateInput(new Date()),
      amountUSD,
      amountLocal: hasLocal ? local : amountUSD,
      currency: hasLocal ? declared : 'USD',
      rate: hasLocal ? local / amountUSD : 1,
      where: String(row.lastPaidWhere || '').trim(),
    };
    if (!hasLocal && declared !== 'USD') item._csvRateDropped = declared;
  }

  return item;
}

function normalizeCsvBag(row) {
  return {
    id: row.id?.trim() || null,
    name: String(row.name ?? '').trim(),
    owner: pick(row.owner, VALID_PERSON, 'Both'),
    emoji: row.emoji?.trim() || '🎒',
    order: num(row.order, 99),
  };
}

// ── Diff planning ─────────────────────────────────────────────────

const key = (name, person) => `${String(name).trim().toLowerCase()}|${String(person || '').toLowerCase()}`;

/** Fields compared when deciding whether a row actually changed. */
const COMPARED = ['name', 'category', 'person', 'qty', 'status', 'inBag', 'condition', 'estLifeMonths', 'replaceQty', 'targetPrice', 'waitPrice', 'notes'];

function diffFields(before, after, fields) {
  const changes = [];
  fields.forEach((f) => {
    const a = before?.[f] ?? null;
    const b = after?.[f] ?? null;
    const same = (a === null && b === null) || String(a) === String(b);
    if (!same) changes.push({ field: f, from: a, to: b });
  });
  return changes;
}

/**
 * Works out exactly what an import would do, without doing any of it.
 *
 * mode:
 *   'update'  — only touch rows that already exist (safest)
 *   'merge'   — update existing and add new rows
 *   'replace' — merge, and delete anything absent from the file
 */
export function buildPlan({ incoming, existingItems = [], existingBags = [], mode = 'merge' }) {
  const warnings = [...(incoming.warnings || [])];

  const byId   = new Map(existingItems.map((i) => [i.id, i]));
  const byName = new Map(existingItems.map((i) => [key(i.name, i.person), i]));

  // Name-only matching, for sheets cut down to just a couple of columns.
  // Names that aren't unique (Mike and Jen both own a "Beanie") are recorded as
  // ambiguous and skipped rather than guessed at.
  const byBareName = new Map();
  const ambiguousNames = new Set();
  existingItems.forEach((i) => {
    const k = String(i.name || '').trim().toLowerCase();
    if (byBareName.has(k)) ambiguousNames.add(k);
    else byBareName.set(k, i);
  });
  const bagById   = new Map(existingBags.map((b) => [b.id, b]));
  const bagByName = new Map(existingBags.map((b) => [String(b.name).trim().toLowerCase(), b]));

  const itemCreates = [], itemUpdates = [], itemDeletes = [];
  const bagCreates  = [], bagUpdates  = [];
  const seenItemIds = new Set();
  let unchangedItems = 0;
  const skipped = [];

  // ── Bags ──
  (incoming.bags || []).forEach((bag) => {
    if (!bag.name) { skipped.push('A bag row has no name.'); return; }
    const existing = (bag.id && bagById.get(bag.id)) || bagByName.get(bag.name.toLowerCase());
    if (existing) {
      const changes = diffFields(existing, bag, BAG_FIELDS);
      if (changes.length) bagUpdates.push({ id: existing.id, before: existing, after: bag, changes });
    } else if (mode !== 'update') {
      bagCreates.push(bag);
    }
  });

  // Bags referenced by items but not present anywhere yet.
  const knownBagNames = new Set([
    ...existingBags.map((b) => String(b.name).trim().toLowerCase()),
    ...(incoming.bags || []).map((b) => String(b.name).trim().toLowerCase()),
    ...bagCreates.map((b) => String(b.name).trim().toLowerCase()),
  ]);
  const missingBags = new Map();

  // ── Items ──
  (incoming.items || []).forEach((item, idx) => {
    if (!item.name) { skipped.push(`Row ${idx + 2} has no name and was skipped.`); return; }

    if (item.inBag) {
      const k = item.inBag.trim().toLowerCase();
      if (!knownBagNames.has(k) && !missingBags.has(k)) {
        missingBags.set(k, { id: null, name: item.inBag.trim(), owner: item.person === 'Both' ? 'Both' : item.person, emoji: '🎒', order: 99 });
      }
    }

    const provided = item._provided || COMPARED;
    const bareName = String(item.name).trim().toLowerCase();

    let existing = item.id ? byId.get(item.id) : null;
    if (!existing && provided.includes('person')) existing = byName.get(key(item.name, item.person));
    if (!existing && !provided.includes('person')) {
      if (ambiguousNames.has(bareName)) {
        skipped.push(`“${item.name}” matches more than one item — add a person column to say which.`);
        return;
      }
      existing = byBareName.get(bareName);
    }

    if (existing) {
      seenItemIds.add(existing.id);
      // Only columns actually present in the file count as edits.
      const changes = diffFields(existing, item, COMPARED.filter((f) => provided.includes(f)));

      // A price typed into the CSV only counts if it isn't already on record.
      let addPurchase = null;
      if (item._csvPurchase) {
        const already = (existing.purchases || []).some(
          (p) => p.date === item._csvPurchase.date &&
                 Number(p.amountUSD) === Number(item._csvPurchase.amountUSD),
        );
        if (!already) {
          addPurchase = item._csvPurchase;
          changes.push({ field: 'purchase', from: null, to: `${item._csvPurchase.amountUSD} on ${item._csvPurchase.date}` });
        }
      }

      if (changes.length) itemUpdates.push({ id: existing.id, before: existing, after: item, changes, addPurchase });
      else unchangedItems++;
    } else if (mode === 'update') {
      skipped.push(`“${item.name}” is not in the app yet — switch to Merge to add it.`);
    } else {
      itemCreates.push(item);
    }
  });

  if (mode !== 'update') missingBags.forEach((b) => bagCreates.push(b));

  if (mode === 'replace') {
    existingItems.forEach((i) => { if (!seenItemIds.has(i.id)) itemDeletes.push(i); });
  }

  const rateDropped = (incoming.items || []).filter((i) => i._csvRateDropped).length;
  if (rateDropped) {
    warnings.push(`${rateDropped} row(s) named a non-USD currency without a lastPaidLocal amount — there is no rate to record, so they are logged in USD.`);
  }

  if (missingBags.size && mode !== 'update') {
    warnings.push(`${missingBags.size} bag(s) referenced by items don't exist yet and will be created.`);
  }

  return {
    mode,
    kind: incoming.kind,
    itemCreates, itemUpdates, itemDeletes,
    bagCreates, bagUpdates,
    unchangedItems,
    skipped,
    warnings,
    settings: incoming.settings || null,
    totalWrites: itemCreates.length + itemUpdates.length + itemDeletes.length + bagCreates.length + bagUpdates.length,
  };
}

// ── Download helper ───────────────────────────────────────────────

export function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(base, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${base}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${ext}`;
}
