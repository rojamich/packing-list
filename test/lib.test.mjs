// Tests for the pure logic in src/lib/.
//
// These modules import with explicit extensions and touch neither React nor
// Firestore, specifically so they run under plain Node:  npm test
//
// Weighted towards money and transfer, where a silent bug costs real money or
// real data. Several cases below are regressions found in the 2026-08 audit and
// are named after what went wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dealVerdict, waitPctOff, waitPriceIssue, waitPriceFromPct,
  toUSD, fromUSD, rateFor, fetchRates, FALLBACK_RATES, decimalsFor,
} from '../src/lib/money.js';
import { getPackState, cyclePack, stepPack, packFields, packTotals, itemQty } from '../src/lib/packing.js';
import { parseDate, toDateInput, addMonths, replaceByDate, lastPurchase } from '../src/lib/dates.js';
import { parseCSV, toCSV, itemsToCSV, parseImportFile, buildPlan } from '../src/lib/transfer.js';

// ── money: deal verdicts ──────────────────────────────────────────

test('deal bands score against the target price', () => {
  assert.equal(dealVerdict(60, 100).key, 'steal');    // 30%+ under
  assert.equal(dealVerdict(80, 100).key, 'good');
  assert.equal(dealVerdict(100, 100).key, 'fair');
  assert.equal(dealVerdict(120, 100).key, 'high');
  assert.equal(dealVerdict(150, 100).key, 'overpay');
});

test('a wait price takes over from the generic bands', () => {
  assert.equal(dealVerdict(65, 100, 70).key, 'buy');       // at or below wait
  assert.equal(dealVerdict(85, 100, 70).key, 'fairWait');  // under target, above wait
  assert.equal(dealVerdict(150, 100, 70).key, 'overpay');
});

test('no verdict without something real to judge', () => {
  assert.equal(dealVerdict(50, null), null);
  assert.equal(dealVerdict(50, 0), null);
  assert.equal(dealVerdict(null, 100), null);
  assert.equal(dealVerdict('', 100), null, 'empty string must not score as free');
});

test('regression: a price of zero is not a "Steal"', () => {
  // 0 used to pass num() and land in the ratio <= 0.7 band.
  assert.equal(dealVerdict(0, 100), null);
  assert.equal(dealVerdict(-5, 100), null);
});

test('regression: a wait price at or above target is reported, not swallowed', () => {
  // dealVerdict only honours w < t. It used to drop it silently and return a
  // confident verdict from the fallback bands.
  assert.match(waitPriceIssue(100, 150), /below the target/);
  assert.match(waitPriceIssue(100, 100), /below the target/);
  assert.equal(waitPriceIssue(100, 70), null);
  assert.equal(waitPriceIssue(100, null), null);
  assert.match(waitPriceIssue(null, 70), /Set a target price/);
});

test('wait percentages convert both ways', () => {
  assert.equal(waitPctOff(100, 70), 30);
  assert.equal(waitPctOff(100, 100), null, 'not a discount');
  assert.equal(waitPriceFromPct(100, 30), 70);
  assert.equal(waitPriceFromPct(100, 0), null);
});

// ── money: currency ───────────────────────────────────────────────

test('conversion round-trips through the stored rate', () => {
  const rates = { THB: 34.5 };
  assert.equal(toUSD(345, 'THB', rates), 10);
  assert.equal(fromUSD(10, 'THB', rates), 345);
  assert.equal(rateFor('THB', {}), FALLBACK_RATES.THB, 'falls back when absent');
  assert.equal(rateFor('THB', { THB: 0 }), FALLBACK_RATES.THB, 'rejects a zero rate');
});

test('zero-decimal currencies format without cents', () => {
  assert.equal(decimalsFor('JPY'), 0);
  assert.equal(decimalsFor('USD'), 2);
});

test('regression: rate feed is checked before it reprices everything', async () => {
  const mock = (payload, ok = true) => { global.fetch = async () => ({ ok, json: async () => payload }); };

  mock({ result: 'success', rates: { USD: 1, THB: 34.6, JPY: 151 } });
  assert.equal((await fetchRates()).THB, 34.6);

  mock({ result: 'success', rates: { USD: 0.92, EUR: 1, THB: 31.8 } });
  assert.equal(await fetchRates(), null, 'a non-USD base would scale every conversion');

  mock({ result: 'success', rates: { USD: 1, THB: 0.00346, JPY: 151 } });
  const slipped = await fetchRates();
  assert.ok(!('THB' in slipped), 'decimal slip dropped');
  assert.equal(slipped.JPY, 151, 'siblings survive');

  mock({ result: 'success', rates: { USD: 1, ARS: 4200, EUR: 0.93 } });
  assert.equal((await fetchRates()).ARS, 4200, 'real inflation must not be rejected');

  mock({ result: 'error' });
  assert.equal(await fetchRates(), null);
});

// ── packing ───────────────────────────────────────────────────────

test('packing counts units, not rows', () => {
  const totals = packTotals([{ qty: 3, packedQty: 1 }, { qty: 2, worn: true }]);
  assert.deepEqual(totals, { total: 5, packed: 1, worn: 2, done: 3 });
});

test('legacy pack fields still read correctly', () => {
  assert.equal(getPackState({ qty: 2, packed: true }).status, 'packed');
  assert.equal(getPackState({ qty: 2, packStatus: 'worn' }).status, 'worn');
  assert.equal(getPackState({ qty: 2 }).status, 'unpacked');
  assert.equal(itemQty({ qty: 0 }), 1, 'qty is at least 1');
});

test('writes keep the legacy mirrors in sync', () => {
  const f = packFields(3, 3, false);
  assert.equal(f.packed, true);
  assert.equal(f.packStatus, 'packed');
  assert.equal(packFields(3, 1, false).packStatus, 'unpacked', 'partial reads as unpacked to old clients');
  assert.equal(packFields(3, 2, true).packedQty, 0, 'worn clears the packed count');
});

test('tapping cycles unpacked -> packed -> worn -> unpacked', () => {
  const item = { qty: 2, packedQty: 0 };
  const packed = cyclePack(item);
  assert.equal(packed.packedQty, 2);
  const worn = cyclePack({ ...item, ...packed });
  assert.equal(worn.worn, true);
  assert.equal(cyclePack({ ...item, ...worn }).packedQty, 0);
});

test('the stepper clamps and clears worn', () => {
  assert.equal(stepPack({ qty: 3, packedQty: 3 }, 1).packedQty, 3, 'cannot exceed qty');
  assert.equal(stepPack({ qty: 3, packedQty: 0 }, -1).packedQty, 0, 'cannot go negative');
  assert.equal(stepPack({ qty: 3, worn: true }, -1).worn, false);
});

// ── dates ─────────────────────────────────────────────────────────

test('YYYY-MM-DD parses in local time, not UTC', () => {
  const d = parseDate('2026-08-09');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 9, 'must not shift a day back in the Americas');
  assert.equal(toDateInput(d), '2026-08-09');
});

test('adding months clamps to the end of a short month', () => {
  assert.equal(toDateInput(addMonths(new Date(2026, 0, 31), 1)), '2026-02-28');
  assert.equal(toDateInput(addMonths(new Date(2026, 0, 15), 12)), '2027-01-15');
});

test('replace-by comes from the newest purchase', () => {
  const item = {
    estLifeMonths: 12,
    purchases: [
      { date: '2025-01-10', amountUSD: 10 },
      { date: '2026-03-05', amountUSD: 20 },
    ],
  };
  assert.equal(lastPurchase(item).amountUSD, 20);
  assert.equal(toDateInput(replaceByDate(item)), '2027-03-05');
  assert.equal(replaceByDate({ estLifeMonths: 12 }), null, 'unknown without a purchase');
});

// ── transfer: CSV ─────────────────────────────────────────────────

test('CSV survives commas, quotes and newlines', () => {
  const rows = [{ a: 'x,y', b: 'say "hi"', c: 'one\ntwo' }];
  const parsed = parseCSV(toCSV(['a', 'b', 'c'], rows));
  assert.deepEqual(parsed.rows[0], rows[0]);
});

test('CSV export/import round-trips an item', () => {
  const items = [{
    id: 'i1', name: 'Merino t-shirt', category: 'Clothing', person: 'Mike',
    qty: 3, status: 'have', inBag: 'Farpoint 40', condition: 'good',
    estLifeMonths: 18, targetPrice: 60, waitPrice: 42, notes: 'Wool&Prince, 2 for $100',
    purchases: [{ id: 'p1', date: '2026-01-05', amountUSD: 55, amountLocal: 55, currency: 'USD', rate: 1 }],
  }];
  const back = parseImportFile(itemsToCSV(items), 'items.csv');
  const row = back.items[0];
  assert.equal(row.id, 'i1');
  assert.equal(row.name, 'Merino t-shirt');
  assert.equal(row.qty, 3);
  assert.equal(row.targetPrice, 60);
  assert.equal(row.waitPrice, 42);
  assert.equal(row.notes, 'Wool&Prince, 2 for $100');
});

test('a cut-down CSV only edits the columns it contains', () => {
  const parsed = parseImportFile('id,name,targetPrice\ni1,Beanie,25', 'prices.csv');
  const existing = [{
    id: 'i1', name: 'Beanie', person: 'Mike', category: 'Clothing',
    inBag: 'Sling', qty: 2, notes: 'keep me', targetPrice: 40,
  }];
  const plan = buildPlan({ incoming: parsed, existingItems: existing, existingBags: [], mode: 'update' });
  assert.equal(plan.itemUpdates.length, 1);
  assert.deepEqual(plan.itemUpdates[0].changes.map((c) => c.field), ['targetPrice'],
    'a prices-only sheet must not blank bags, quantities or notes');
});

test('regression: a foreign currency without a local amount does not fabricate a rate', () => {
  // lastPaidLocal used to default to the USD figure, storing a THB purchase at
  // a rate of 1 and quietly breaking the stored-rate guarantee.
  const parsed = parseImportFile(
    'name,category,lastPaidUSD,lastPaidCurrency,lastPaidLocal\n'
    + 'Beanie,Clothing,50,THB,\n'
    + 'Gloves,Clothing,30,THB,1050',
    'items.csv',
  );
  const [beanie, gloves] = parsed.items.map((i) => i._csvPurchase);
  assert.equal(beanie.currency, 'USD');
  assert.equal(beanie.rate, 1);
  assert.equal(gloves.currency, 'THB');
  assert.equal(gloves.rate, 35);

  const plan = buildPlan({ incoming: parsed, existingItems: [], existingBags: [], mode: 'merge' });
  assert.ok(plan.warnings.some((w) => /no rate to record/.test(w)), 'the dropped currency is reported');
});

// ── transfer: planning ────────────────────────────────────────────

const incoming = (items) => ({ kind: 'items-csv', items, bags: [], settings: null, warnings: [] });
const row = (over) => ({ _provided: ['name', 'person', 'targetPrice'], name: 'X', person: 'Mike', targetPrice: 10, ...over });

test('import modes differ only in what they add and remove', () => {
  const existing = [{ id: 'a', name: 'Kept', person: 'Mike', targetPrice: 10 }];
  const file = incoming([row({ name: 'New', targetPrice: 5 })]);

  const update = buildPlan({ incoming: file, existingItems: existing, existingBags: [], mode: 'update' });
  assert.equal(update.itemCreates.length, 0, 'update never adds');
  assert.equal(update.itemDeletes.length, 0);
  assert.equal(update.skipped.length, 1);

  const merge = buildPlan({ incoming: file, existingItems: existing, existingBags: [], mode: 'merge' });
  assert.equal(merge.itemCreates.length, 1);
  assert.equal(merge.itemDeletes.length, 0, 'merge never deletes');

  const replace = buildPlan({ incoming: file, existingItems: existing, existingBags: [], mode: 'replace' });
  assert.equal(replace.itemCreates.length, 1);
  assert.deepEqual(replace.itemDeletes.map((i) => i.id), ['a']);
});

test('an ambiguous name is skipped rather than guessed at', () => {
  const existing = [
    { id: 'a', name: 'Beanie', person: 'Mike' },
    { id: 'b', name: 'Beanie', person: 'Jen' },
  ];
  const file = {
    kind: 'items-csv',
    items: [{ _provided: ['name'], name: 'Beanie', targetPrice: 20 }],
    bags: [], settings: null, warnings: [],
  };
  const plan = buildPlan({ incoming: file, existingItems: existing, existingBags: [], mode: 'merge' });
  assert.equal(plan.itemUpdates.length, 0);
  assert.equal(plan.itemCreates.length, 0);
  assert.match(plan.skipped[0], /matches more than one item/);
});

test('an unchanged row produces no write', () => {
  const existing = [{ id: 'a', name: 'X', person: 'Mike', targetPrice: 10 }];
  const plan = buildPlan({ incoming: incoming([row()]), existingItems: existing, existingBags: [], mode: 'merge' });
  assert.equal(plan.totalWrites, 0);
  assert.equal(plan.unchangedItems, 1);
});

test('a JSON backup from another app is refused', () => {
  assert.throws(() => parseImportFile('{"schema":"something-else","items":[]}', 'x.json'), /not exported from this app/);
  assert.throws(() => parseImportFile('{not json', 'x.json'), /not valid JSON/);
});
