// Date helpers — all parsing is timezone-safe.
// Firestore may hand back a Timestamp; the app stores 'YYYY-MM-DD' strings.

export function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (val?.toDate) return val.toDate();
  if (typeof val === 'string') {
    // new Date('2026-08-09') parses as UTC midnight and shifts a day back in
    // the Americas — build it in local time instead.
    const m = val.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(val);
    return isNaN(d) ? null : d;
  }
  return null;
}

export function toDateInput(val) {
  const d = parseDate(val);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// setMonth() overflows: Jan 31 + 1 month lands on Mar 3. Clamp to month end.
export function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}

export const DEFAULT_LIFE_MONTHS = 24;

/** When this item is due for replacement, or null if we don't know when it was bought. */
export function replaceByDate(item) {
  const bought = parseDate(lastPurchaseDate(item));
  if (!bought) return null;
  return addMonths(bought, Number(item.estLifeMonths) || DEFAULT_LIFE_MONTHS);
}

export function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - today) / 86400000);
}

export function formatMonthYear(date) {
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatDay(val) {
  const d = parseDate(val);
  if (!d) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The date of the most recent purchase. Falls back to the legacy top-level
 * purchaseDate field for items written before purchase history existed.
 */
export function lastPurchaseDate(item) {
  const p = lastPurchase(item);
  return p ? p.date : item?.purchaseDate || null;
}

/** Most recent entry in the purchase history, or null. */
export function lastPurchase(item) {
  const list = Array.isArray(item?.purchases) ? item.purchases : [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
}
