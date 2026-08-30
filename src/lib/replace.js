// Replacement state.
//
// `status` is the whole-item intent: do we own it ('have'), still need to buy
// it ('buy'), or is it worn out ('replace'). That was too coarse once quantity
// mattered — of two pairs of shorts, one can be fine and one shot.
//
// `replaceQty` carries that: how many of `qty` units need replacing. It is the
// source of truth; `status: 'replace'` is kept in sync as the whole-item mirror
// so older reads and the existing filters keep working.

import { itemQty } from './packing.js';
import { replaceByDate, daysUntil, DEFAULT_LIFE_MONTHS } from './dates.js';

const clamp = (lo, hi, n) => Math.max(lo, Math.min(hi, Math.floor(n)));

export function replaceState(item) {
  const qty = itemQty(item);

  let n = Number(item?.replaceQty);
  if (!Number.isFinite(n)) {
    // Legacy: 'replace' was a whole-item status, so it meant all of them.
    n = item?.status === 'replace' ? qty : 0;
  }
  n = clamp(0, qty, n);

  return {
    qty,
    replaceQty: n,
    keepQty: qty - n,
    all: n > 0 && n === qty,
    some: n > 0 && n < qty,
    any: n > 0,
  };
}

/** Fields to write when the replacement count changes, mirrors included. */
export function replaceFields(item, replaceQty) {
  const qty = itemQty(item);
  const n = clamp(0, qty, replaceQty || 0);
  const wasBuy = item?.status === 'buy';

  return {
    replaceQty: n,
    // Whole-item mirror. 'buy' is about not owning it yet, which replacement
    // count says nothing about, so it is left alone.
    status: wasBuy ? 'buy' : (n === qty && qty > 0 ? 'replace' : 'have'),
  };
}

export const URGENCY_ORDER = ['now', 'overdue', 'soon', 'watch', 'ok'];

/**
 * How badly this item needs attention. Anything with units flagged for
 * replacement jumps the queue regardless of dates; otherwise it is driven by
 * the estimated life running out.
 */
export function getUrgency(item) {
  if (replaceState(item).any) return 'now';

  const due = replaceByDate(item);
  if (!due) return null;

  const left = daysUntil(due);
  if (left <= 0) return 'overdue';
  if (left <= 90) return 'soon';
  if (left <= 180) return 'watch';
  return 'ok';
}

/**
 * What it costs to replace the units actually flagged on one item — not the
 * whole line. Falls back to what was last paid when there is no target price,
 * and reports which of the two it used so the total is never quietly wrong.
 */
export function replacementCost(item, lastPaidUSD) {
  const { replaceQty, qty } = replaceState(item);
  // Items flagged only by date have nothing marked yet, so price the whole line.
  const units = replaceQty > 0 ? replaceQty : qty;

  const target = Number(item?.targetPrice);
  if (Number.isFinite(target) && target > 0) {
    return { units, usd: target * units, basis: 'target' };
  }

  const paid = Number(lastPaidUSD);
  if (Number.isFinite(paid) && paid > 0) {
    return { units, usd: paid * units, basis: 'paid' };
  }

  return { units, usd: 0, basis: 'unknown' };
}

export { DEFAULT_LIFE_MONTHS };
