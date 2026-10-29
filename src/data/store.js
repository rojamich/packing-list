// All Firestore writes live here. Reads are in ../context/DataContext.jsx,
// which holds a single subscription per collection.

import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  writeBatch, serverTimestamp, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SEED_ITEMS, SEED_BAGS } from './seedData';
import { packFields, itemQty, getPackState } from '../lib/packing';
import { toDateInput } from '../lib/dates';
import { HYGIENE_CATEGORY, LEGACY_HYGIENE_CATEGORIES } from '../lib/categories';

export const SETTINGS_DOC = doc(db, 'settings', 'app');

// Spacing between sortOrder values so a single move can be written without
// renumbering the whole list.
const ORDER_STEP = 1000;

// ── Items ─────────────────────────────────────────────────────────

export async function addItem(data) {
  const qty = itemQty(data);
  return addDoc(collection(db, 'items'), {
    ...data,
    qty,
    ...packFields(qty, 0, 0),
    purchases: data.purchases || [],
    replaceQty: data.replaceQty ?? 0,
    targetPrice: data.targetPrice ?? null,
    waitPrice: data.waitPrice ?? null,
    sortOrder: data.sortOrder ?? Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateItem(id, data) {
  const { id: _id, createdAt, ...rest } = data;
  await updateDoc(doc(db, 'items', id), { ...rest, updatedAt: serverTimestamp() });
}

/** Apply the same safe field changes to a deliberate multi-selection. */
export async function bulkUpdateItems(ids = [], changes = {}) {
  const targets = [...new Set(ids)].filter(Boolean);
  const allowed = ['category', 'person', 'status', 'inBag'];
  const data = Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => allowed.includes(key) && value !== undefined),
  );
  if (!targets.length || Object.keys(data).length === 0) return;
  await commitInChunks(targets, (batch, id) => {
    batch.update(doc(db, 'items', id), { ...data, updatedAt: serverTimestamp() });
  });
}

export async function deleteItem(id) {
  await deleteDoc(doc(db, 'items', id));
}

export async function setPackState(id, fields) {
  await updateDoc(doc(db, 'items', id), { ...fields, updatedAt: serverTimestamp() });
}

export async function resetAllPacked(items) {
  const targets = items.filter((i) => getPackState(i).doneQty > 0);
  if (targets.length === 0) return;
  await commitInChunks(targets, (batch, item) => {
    batch.update(doc(db, 'items', item.id), packFields(itemQty(item), 0, 0));
  });
}

/**
 * Persist a new within-bag ordering. `orderedIds` is the full group, in order.
 *
 * `base` separates one bag's block of sortOrder values from the next. Without
 * it every bag started at ORDER_STEP, so values collided across bags and the
 * collection-wide sort in DataContext meant nothing.
 */
export async function reorderItems(orderedIds, base = 0) {
  if (!orderedIds?.length) return;
  await commitInChunks(orderedIds, (batch, id, i) => {
    batch.update(doc(db, 'items', id), { sortOrder: base + (i + 1) * ORDER_STEP });
  });
}

/** Update the old shared-hygiene labels once the list has loaded. */
export async function migrateLegacyHygieneCategories(items = []) {
  const legacyItems = items.filter((item) => LEGACY_HYGIENE_CATEGORIES.has(item.category));
  if (legacyItems.length === 0) return;
  await commitInChunks(legacyItems, (batch, item) => {
    batch.update(doc(db, 'items', item.id), {
      category: HYGIENE_CATEGORY,
      updatedAt: serverTimestamp(),
    });
  });
}

// ── Purchases ─────────────────────────────────────────────────────

/**
 * Append a purchase. The USD amount and the rate used are both stored, so a
 * price logged in Bangkok still reads correctly a year later.
 */
export async function logPurchase(item, entry) {
  await setPurchases(item.id, [...(item.purchases || []), entry]);
}

export async function removePurchase(item, purchaseId) {
  await setPurchases(item.id, (item.purchases || []).filter((p) => p.id !== purchaseId));
}

function normalizePurchase(entry) {
  return {
    id: entry.id && !String(entry.id).startsWith('pending-')
      ? entry.id
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: entry.date || toDateInput(new Date()),
    amountUSD: Number(entry.amountUSD) || 0,
    amountLocal: Number(entry.amountLocal) || 0,
    currency: entry.currency || 'USD',
    rate: Number(entry.rate) || 1,
    where: entry.where || '',
    note: entry.note || '',
  };
}

/** Replace the whole history. The top-level cost/purchaseDate mirrors follow the newest entry. */
export async function setPurchases(id, entries) {
  const purchases = (entries || []).map(normalizePurchase);
  const latest = [...purchases].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  await updateDoc(doc(db, 'items', id), {
    purchases,
    // Mirrors so replacement dates and older views keep working.
    purchaseDate: latest?.date ?? null,
    cost: latest?.amountUSD ?? null,
    updatedAt: serverTimestamp(),
  });
}

// ── Bags ──────────────────────────────────────────────────────────

export async function addBag(data) {
  return addDoc(collection(db, 'bags'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Keep every name-based reference intact when a bag is renamed. */
export async function updateBag(id, oldName, newData) {
  await updateDoc(doc(db, 'bags', id), { ...newData, updatedAt: serverTimestamp() });
  if (oldName && oldName !== newData.name) {
    const [itemSnap, childSnap] = await Promise.all([
      getDocs(query(collection(db, 'items'), where('inBag', '==', oldName))),
      getDocs(query(collection(db, 'bags'), where('parentBag', '==', oldName))),
    ]);
    if (!itemSnap.empty) await commitInChunks(itemSnap.docs, (batch, d) => batch.update(d.ref, { inBag: newData.name }));
    if (!childSnap.empty) await commitInChunks(childSnap.docs, (batch, d) => batch.update(d.ref, { parentBag: newData.name }));
  }
}

export async function deleteBag(id, name, reassignTo = null) {
  const [itemSnap, childSnap] = await Promise.all([
    getDocs(query(collection(db, 'items'), where('inBag', '==', name))),
    getDocs(query(collection(db, 'bags'), where('parentBag', '==', name))),
  ]);
  if (!itemSnap.empty) await commitInChunks(itemSnap.docs, (batch, d) => batch.update(d.ref, { inBag: reassignTo }));
  // A parent can only be top-level, so its children become independent bags.
  if (!childSnap.empty) await commitInChunks(childSnap.docs, (batch, d) => batch.update(d.ref, { parentBag: null }));
  await deleteDoc(doc(db, 'bags', id));
}

/**
 * Fold one or more bags into another.
 *
 * Items reference bags by name, so this rewrites `inBag` on every member of the
 * losing bags before deleting them. Items move first: if the run is interrupted
 * the worst case is a surviving empty bag, never an item pointing at a bag that
 * no longer exists.
 */
export async function mergeBags(keeperName, losers = []) {
  const targets = losers.filter((b) => b?.name && b.name !== keeperName);
  if (targets.length === 0) return { moved: 0, removed: 0 };

  let moved = 0;
  for (const loser of targets) {
    const [itemSnap, childSnap] = await Promise.all([
      getDocs(query(collection(db, 'items'), where('inBag', '==', loser.name))),
      getDocs(query(collection(db, 'bags'), where('parentBag', '==', loser.name))),
    ]);
    if (!itemSnap.empty) {
      await commitInChunks(itemSnap.docs, (batch, d) => batch.update(d.ref, { inBag: keeperName }));
      moved += itemSnap.size;
    }
    if (!childSnap.empty) await commitInChunks(childSnap.docs, (batch, d) => batch.update(d.ref, { parentBag: keeperName }));
  }

  const removable = targets.filter((b) => b.id);
  await commitInChunks(removable, (batch, b) => batch.delete(doc(db, 'bags', b.id)));

  return { moved, removed: removable.length };
}

// ── Categories ───────────────────────────────────────────────────

export async function addCategory(name) {
  return addDoc(collection(db, 'categories'), { name: name.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateCategory(id, oldName, name) {
  const nextName = name.trim();
  if (!nextName) return;
  const snap = await getDocs(query(collection(db, 'items'), where('category', '==', oldName)));
  if (!snap.empty) await commitInChunks(snap.docs, (batch, d) => batch.update(d.ref, { category: nextName, updatedAt: serverTimestamp() }));
  if (id) await updateDoc(doc(db, 'categories', id), { name: nextName, updatedAt: serverTimestamp() });
  else await addCategory(nextName);
}

export async function deleteCategory(id, name, replacement = 'Other') {
  const snap = await getDocs(query(collection(db, 'items'), where('category', '==', name)));
  if (!snap.empty) await commitInChunks(snap.docs, (batch, d) => batch.update(d.ref, { category: replacement, updatedAt: serverTimestamp() }));
  if (id) await deleteDoc(doc(db, 'categories', id));
}

// ── Packing profiles ─────────────────────────────────────────────

export async function addProfile({ name, itemIds, itemKeys = [] }) {
  return addDoc(collection(db, 'profiles'), {
    name: name.trim(),
    itemIds: [...new Set(itemIds || [])],
    itemKeys: itemKeys.filter((key) => key?.name).slice(0, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProfile(id) {
  await deleteDoc(doc(db, 'profiles', id));
}

/** A sub-bag is ticked as one unit inside its parent. */
export async function setBagPacked(id, packed) {
  await updateDoc(doc(db, 'bags', id), { packed: !!packed, updatedAt: serverTimestamp() });
}

/** Untick sub-bags alongside the items when resetting. */
export async function resetPackedBags(bags = []) {
  const targets = bags.filter((b) => b?.id && b.packed === true);
  if (targets.length === 0) return;
  await commitInChunks(targets, (batch, b) => {
    batch.update(doc(db, 'bags', b.id), { packed: false, updatedAt: serverTimestamp() });
  });
}

export async function reorderBags(orderedIds) {
  if (!orderedIds?.length) return;
  await commitInChunks(orderedIds, (batch, id, i) => {
    batch.update(doc(db, 'bags', id), { order: i + 1 });
  });
}

// ── Settings ──────────────────────────────────────────────────────

export async function updateSettings(data) {
  await setDoc(SETTINGS_DOC, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// ── Seed ──────────────────────────────────────────────────────────

/**
 * First-run import. Guarded: re-running can't duplicate the list, which the
 * old version would happily do.
 */
export async function seedDatabase() {
  const [itemSnap, bagSnap] = await Promise.all([
    getDocs(collection(db, 'items')),
    getDocs(collection(db, 'bags')),
  ]);

  if (bagSnap.empty) {
    const batch = writeBatch(db);
    SEED_BAGS.forEach((bag) => {
      batch.set(doc(collection(db, 'bags')), { ...bag, createdAt: serverTimestamp() });
    });
    await batch.commit();
  }

  if (!itemSnap.empty) return { skipped: true, count: itemSnap.size };

  await commitInChunks(SEED_ITEMS, (batch, item, i) => {
    const qty = itemQty(item);
    batch.set(doc(collection(db, 'items')), {
      ...item,
      qty,
      ...packFields(qty, 0, 0),
      purchases: [],
      purchaseDate: null,
      cost: null,
      targetPrice: item.targetPrice ?? null,
      sortOrder: (i + 1) * ORDER_STEP,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { skipped: false, count: SEED_ITEMS.length };
}

// ── Import ────────────────────────────────────────────────────────

/**
 * Applies a plan from lib/transfer.js. The plan has already been shown to the
 * user, so this just executes it — batched, so a big import is a handful of
 * round trips rather than hundreds.
 */
export async function applyImportPlan(plan) {
  const ops = [];

  // Bags first so items referring to them land in a consistent world.
  plan.bagCreates.forEach((bag) => ops.push({ kind: 'bag-create', bag }));
  plan.bagUpdates.forEach((u) => ops.push({ kind: 'bag-update', id: u.id, bag: u.after }));

  plan.itemCreates.forEach((item) => ops.push({ kind: 'item-create', item }));
  plan.itemUpdates.forEach((u) => ops.push({ kind: 'item-update', id: u.id, item: u.after, addPurchase: u.addPurchase, before: u.before }));
  plan.itemDeletes.forEach((item) => ops.push({ kind: 'item-delete', id: item.id }));
  (plan.categoryRestores || []).forEach((category) => ops.push({ kind: 'category-upsert', category }));
  (plan.profileRestores || []).forEach((profile) => ops.push({ kind: 'profile-upsert', profile }));

  await commitInChunks(ops, (batch, op, i) => {
    switch (op.kind) {
      case 'bag-create':
        batch.set(doc(collection(db, 'bags')), {
          name: op.bag.name, owner: op.bag.owner, emoji: op.bag.emoji, order: op.bag.order,
          parentBag: op.bag.parentBag ?? null,
          capacityGrams: op.bag.capacityGrams ?? null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        break;

      case 'bag-update':
        batch.update(doc(db, 'bags', op.id), {
          name: op.bag.name, owner: op.bag.owner, emoji: op.bag.emoji, order: op.bag.order,
          parentBag: op.bag.parentBag ?? null,
          capacityGrams: op.bag.capacityGrams ?? null,
          updatedAt: serverTimestamp(),
        });
        break;

      case 'item-create': {
        const qty = itemQty(op.item);
        const purchases = buildPurchases(op.item, []);
        batch.set(doc(collection(db, 'items')), {
          ...itemPayload(op.item, qty),
          ...packFields(qty, op.item.packedQty ?? 0, importedWornQty(op.item, qty)),
          ...purchaseMirrors(purchases),
          sortOrder: op.item.sortOrder ?? (i + 1) * ORDER_STEP,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        break;
      }

      case 'item-update': {
        const qty = itemQty(op.item);
        const purchases = buildPurchases(op.item, op.before?.purchases || [], op.addPurchase);
        // Write only the columns the file actually carried — a prices-only
        // sheet must not blank out bags, quantities or notes.
        const payload = { ...itemPayload(op.item, qty, op.item._provided), updatedAt: serverTimestamp() };

        // A CSV has no pack columns; leave packing state alone unless the file
        // actually carried it (a JSON backup does).
        if (op.item.packedQty !== undefined || op.item.wornQty !== undefined || op.item.worn !== undefined) {
          Object.assign(payload, packFields(qty, op.item.packedQty ?? 0, importedWornQty(op.item, qty)));
        }
        if (purchases) Object.assign(payload, purchaseMirrors(purchases));

        batch.update(doc(db, 'items', op.id), payload);
        break;
      }

      case 'item-delete':
        batch.delete(doc(db, 'items', op.id));
        break;

      case 'category-upsert': {
        const ref = op.category.id ? doc(db, 'categories', op.category.id) : doc(collection(db, 'categories'));
        batch.set(ref, { name: op.category.name, updatedAt: serverTimestamp() }, { merge: true });
        break;
      }

      case 'profile-upsert': {
        const ref = op.profile.id ? doc(db, 'profiles', op.profile.id) : doc(collection(db, 'profiles'));
        batch.set(ref, {
          name: op.profile.name,
          itemIds: op.profile.itemIds || [],
          itemKeys: op.profile.itemKeys || [],
          updatedAt: serverTimestamp(),
        }, { merge: true });
        break;
      }
    }
  });

  if (plan.settings?.activeCurrency) {
    await updateSettings({ activeCurrency: plan.settings.activeCurrency });
  }

  return { writes: ops.length };
}

/**
 * `fields` limits the write to the columns an import actually supplied.
 * Omit it (creates, JSON restores) to write the full record.
 */
function itemPayload(item, qty, fields = null) {
  const full = {
    name: item.name,
    category: item.category,
    person: item.person,
    qty,
    status: item.status,
    inBag: item.inBag ?? null,
    condition: item.condition,
    estLifeMonths: item.estLifeMonths,
    replaceQty: item.replaceQty ?? 0,
    targetPrice: item.targetPrice ?? null,
    waitPrice: item.waitPrice ?? null,
    notes: item.notes ?? '',
    weightGrams: item.weightGrams ?? null,
  };
  if (!fields) return full;

  const out = {};
  fields.forEach((f) => {
    if (f === 'qty') out.qty = qty;
    else if (f in full) out[f] = full[f];
  });
  return out;
}

/** Returns the purchase list to write, or null to leave it untouched. */
function buildPurchases(item, existing, addPurchase) {
  if (Array.isArray(item.purchases) && item.purchases.length) return item.purchases;
  if (addPurchase) return [...existing, addPurchase];
  if (Array.isArray(item.purchases)) return item.purchases;
  return null;
}

function purchaseMirrors(purchases) {
  const list = (purchases || []).map((p, i) => ({
    id: p.id || `imp-${Date.now()}-${i}`,
    date: p.date || null,
    amountUSD: Number(p.amountUSD) || 0,
    amountLocal: Number(p.amountLocal) || 0,
    currency: p.currency || 'USD',
    rate: Number(p.rate) || 1,
    where: p.where || '',
    note: p.note || '',
  }));
  const latest = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return {
    purchases: list,
    purchaseDate: latest?.date ?? null,
    cost: latest?.amountUSD ?? null,
  };
}

/**
 * A backup may carry `wornQty`, or only the old whole-item `worn` flag, in
 * which case worn meant all of them.
 */
function importedWornQty(item, qty) {
  const n = Number(item.wornQty);
  if (Number.isFinite(n)) return n;
  return item.worn ? qty : 0;
}

// ── Batching ──────────────────────────────────────────────────────

// Firestore caps a batch at 500 writes; the gear list is already ~94 items and
// grows, so every bulk write goes through here.
const BATCH_LIMIT = 450;

async function commitInChunks(list, apply) {
  for (let start = 0; start < list.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    list.slice(start, start + BATCH_LIMIT).forEach((entry, i) => apply(batch, entry, start + i));
    await batch.commit();
  }
}
