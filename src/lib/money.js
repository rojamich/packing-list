// Currency + "is this a good deal?" helpers.
//
// Everything is stored in USD so prices stay comparable across countries.
// Local prices are converted at the rate in effect when they're entered, and
// that rate is saved alongside the purchase so history stays honest.

export const BASE_CURRENCY = 'USD';

// Ordered roughly by where they'll actually be living.
export const CURRENCIES = [
  { code: 'USD', symbol: '$',   name: 'US Dollar' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'NOK', symbol: 'kr',  name: 'Norwegian Krone' },
  { code: 'GEL', symbol: '₾',   name: 'Georgian Lari' },
  { code: 'ARS', symbol: '$',   name: 'Argentine Peso' },
  { code: 'MAD', symbol: 'DH',  name: 'Moroccan Dirham' },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc' },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand' },
  { code: 'THB', symbol: '฿',   name: 'Thai Baht' },
  { code: 'VND', symbol: '₫',   name: 'Vietnamese Dong' },
  { code: 'IDR', symbol: 'Rp',  name: 'Indonesian Rupiah' },
  { code: 'MYR', symbol: 'RM',  name: 'Malaysian Ringgit' },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩',   name: 'South Korean Won' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'PHP', symbol: '₱',   name: 'Philippine Peso' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'TRY', symbol: '₺',   name: 'Turkish Lira' },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'NZ Dollar' },
  { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'COP', symbol: 'COL$',name: 'Colombian Peso' },
  { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real' },
  { code: 'CLP', symbol: 'CLP$',name: 'Chilean Peso' },
  { code: 'PEN', symbol: 'S/',  name: 'Peruvian Sol' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr',  name: 'Swedish Krona' },
  { code: 'DKK', symbol: 'kr',  name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł',  name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč',  name: 'Czech Koruna' },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function currencyMeta(code) {
  return CURRENCIES.find((c) => c.code === code) || { code, symbol: code, name: code };
}

// Currencies with no minor unit — showing "¥1,200.00" looks wrong.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP', 'RWF', 'PYG', 'UGX']);

export function decimalsFor(code) {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}

/**
 * Offline fallback: units of each currency per 1 USD. Deliberately approximate —
 * live rates overwrite these on first successful fetch and are shared between
 * devices via Firestore. Only used before the first fetch or if it fails.
 */
export const FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, NOK: 10.7, GEL: 2.7, ARS: 1010, MAD: 9.9,
  RWF: 1310, ZAR: 18.2, THB: 34.5, VND: 25400, IDR: 15800, MYR: 4.45,
  SGD: 1.34, JPY: 152, KRW: 1380, TWD: 32.4, HKD: 7.79, PHP: 58.5,
  INR: 84.2, AED: 3.67, TRY: 34.5, AUD: 1.53, NZD: 1.69, CAD: 1.39,
  MXN: 20.2, COP: 4400, BRL: 5.8, CLP: 970, PEN: 3.78, CHF: 0.88,
  SEK: 10.9, DKK: 6.87, PLN: 4.05, CZK: 24.1,
};

/** Units of `code` per 1 USD, from live rates when available. */
export function rateFor(code, rates) {
  const r = Number(rates?.[code]);
  if (Number.isFinite(r) && r > 0) return r;
  return FALLBACK_RATES[code] ?? 1;
}

export function toUSD(amount, code, rates) {
  const n = num(amount);
  if (!Number.isFinite(n)) return null;
  return n / rateFor(code, rates);
}

export function fromUSD(usd, code, rates) {
  const n = num(usd);
  if (!Number.isFinite(n)) return null;
  return n * rateFor(code, rates);
}

export function formatUSD(amount, { round = false } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: round ? 0 : 2,
    maximumFractionDigits: round ? 0 : 2,
  });
}

export function formatLocal(amount, code, { round = false } = {}) {
  const n = num(amount);
  if (!Number.isFinite(n)) return '—';
  const d = round ? 0 : decimalsFor(code);
  const { symbol } = currencyMeta(code);
  const str = n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${symbol}${str}`;
}

// ── Deal verdict ──────────────────────────────────────────────────
// A price is judged against the item's target price, so "good deal" means the
// same thing in Bangkok and Oslo.

export const VERDICTS = {
  // Used when the item has its own wait price.
  buy:      { key: 'buy',      label: 'Buy now',        hint: 'At or below your wait price', tone: 'green' },
  fairWait: { key: 'fairWait', label: 'Fair — or wait', hint: 'Under target, but this one goes lower', tone: 'blue' },

  // Fallback bands, for items with no wait price set.
  steal:   { key: 'steal',   label: 'Steal',        hint: '30%+ under target',   tone: 'green'  },
  good:    { key: 'good',    label: 'Good deal',    hint: 'Under target',        tone: 'green'  },
  fair:    { key: 'fair',    label: 'At target',    hint: 'Right around target', tone: 'blue'   },

  high:    { key: 'high',    label: 'A bit high',   hint: 'Up to 25% over',      tone: 'amber'  },
  overpay: { key: 'overpay', label: 'Overpriced',   hint: 'More than 25% over',  tone: 'red'    },
};

export const VERDICT_CLASSES = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

/**
 * Number(null) and Number('') are both 0, which would score a missing price as
 * a spectacular deal. Anything not actually numeric has to read as absent.
 */
function num(val) {
  if (val === null || val === undefined || val === '') return NaN;
  return Number(val);
}

/**
 * Compare a USD price against an item's target, and against its wait price
 * when it has one.
 *
 * How deep a discount an item actually reaches varies enormously — a Kindle
 * rarely clears 10% off, while a laptop routinely hits 33%. A single global
 * "30% under target = steal" band therefore under-rates the Kindle sale and
 * over-rates the laptop one. When `waitUSD` is set it takes over: that number
 * is the researched price worth holding out for, so the only question is
 * whether the tag beats it.
 *
 * Returns null when there's no target to judge against — callers show a
 * "set a target price" prompt rather than a bogus verdict.
 */
export function dealVerdict(priceUSD, targetUSD, waitUSD) {
  const p = num(priceUSD);
  const t = num(targetUSD);
  const w = num(waitUSD);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0 || p < 0) return null;

  const ratio = p / t;
  const hasWait = Number.isFinite(w) && w > 0 && w < t;

  if (hasWait) {
    if (p <= w) return { ...VERDICTS.buy,      ratio, waitPrice: w };
    if (p <= t) return { ...VERDICTS.fairWait, ratio, waitPrice: w };
    if (ratio <= 1.25) return { ...VERDICTS.high, ratio, waitPrice: w };
    return { ...VERDICTS.overpay, ratio, waitPrice: w };
  }

  if (ratio <= 0.7)  return { ...VERDICTS.steal,   ratio };
  if (ratio < 0.95)  return { ...VERDICTS.good,    ratio };
  if (ratio <= 1.05) return { ...VERDICTS.fair,    ratio };
  if (ratio <= 1.25) return { ...VERDICTS.high,    ratio };
  return { ...VERDICTS.overpay, ratio };
}

/** How far under target a wait price sits, as a whole percent. */
export function waitPctOff(targetUSD, waitUSD) {
  const t = num(targetUSD);
  const w = num(waitUSD);
  if (!Number.isFinite(t) || !Number.isFinite(w) || t <= 0 || w <= 0 || w >= t) return null;
  return Math.round((1 - w / t) * 100);
}

/** Turn a percent-off into a concrete price, for importing a % column. */
export function waitPriceFromPct(targetUSD, pctOff) {
  const t = num(targetUSD);
  const p = num(pctOff);
  if (!Number.isFinite(t) || !Number.isFinite(p) || t <= 0 || p <= 0 || p >= 100) return null;
  return Math.round(t * (1 - p / 100));
}

/** "18% under target" / "32% over target" — the number behind the verdict. */
export function deltaLabel(priceUSD, targetUSD) {
  const p = num(priceUSD);
  const t = num(targetUSD);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null;
  const pct = Math.round(Math.abs(p - t) / t * 100);
  if (pct === 0) return 'exactly at target';
  return `${pct}% ${p < t ? 'under' : 'over'} target`;
}

// ── Live rates ────────────────────────────────────────────────────

const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
export const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch USD-base rates. No API key required. Returns null on any failure —
 * the caller keeps using whatever rates it already had.
 */
export async function fetchRates() {
  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.result !== 'success' || !json?.rates) return null;
    // Keep only the currencies we show, so the settings doc stays small.
    const rates = {};
    CURRENCY_CODES.forEach((code) => {
      const r = Number(json.rates[code]);
      if (Number.isFinite(r) && r > 0) rates[code] = r;
    });
    return Object.keys(rates).length > 1 ? rates : null;
  } catch {
    return null;
  }
}
