import { useMemo, useState } from 'react';
import { Trash2, Tag, Receipt, Timer } from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  CURRENCIES, currencyMeta, decimalsFor, rateFor, toUSD, fromUSD,
  formatUSD, formatLocal, dealVerdict, deltaLabel, waitPctOff,
  VERDICT_CLASSES, BASE_CURRENCY,
} from '../lib/money';
import { formatDay, toDateInput } from '../lib/dates';
import DealBadge from './DealBadge';

const input =
  'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Target price, the in-store deal check, and purchase history.
 *
 * Prices are stored in USD so they compare across countries; the deal check
 * takes whatever the price tag says locally and converts it before judging.
 */
export default function ItemPricing({
  targetPrice,
  onTargetPriceChange,
  waitPrice,
  onWaitPriceChange,
  purchases = [],
  onLogPurchase,
  onRemovePurchase,
  disabled = false,
}) {
  const { rates, activeCurrency, setActiveCurrency, ratesAreLive, ratesUpdatedAt } = useData();

  const [currency, setCurrency]   = useState(activeCurrency || BASE_CURRENCY);
  const [localPrice, setLocalPrice] = useState('');
  const [where, setWhere]         = useState('');
  const [date, setDate]           = useState(() => toDateInput(new Date()));
  const [logging, setLogging]     = useState(false);
  const [showLog, setShowLog]     = useState(false);

  const targetUSD = targetPrice === '' || targetPrice == null ? null : Number(targetPrice);
  const hasTarget = Number.isFinite(targetUSD) && targetUSD > 0;

  const waitUSD = waitPrice === '' || waitPrice == null ? null : Number(waitPrice);
  const pctOff = waitPctOff(targetUSD, waitUSD);

  const rate = rateFor(currency, rates);
  const enteredUSD = localPrice === '' ? null : toUSD(localPrice, currency, rates);
  const verdict = dealVerdict(enteredUSD, targetUSD, waitUSD);
  const delta = deltaLabel(enteredUSD, targetUSD);

  // What the target price looks like on a local price tag.
  const targetLocal = hasTarget && currency !== BASE_CURRENCY
    ? fromUSD(targetUSD, currency, rates)
    : null;

  const sortedPurchases = useMemo(
    () => [...purchases].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [purchases],
  );

  const lastPaid = sortedPurchases[0] || null;

  const totalSpent = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.amountUSD) || 0), 0),
    [purchases],
  );

  function handleCurrencyChange(code) {
    setCurrency(code);
    // Remember where they are — every other item defaults to this next time.
    if (code !== activeCurrency) setActiveCurrency(code);
  }

  async function handleLog() {
    if (enteredUSD == null || !Number.isFinite(enteredUSD)) return;
    setLogging(true);
    try {
      await onLogPurchase({
        date,
        amountUSD: Number(enteredUSD.toFixed(2)),
        amountLocal: Number(localPrice),
        currency,
        rate,
        where: where.trim(),
      });
      setLocalPrice('');
      setWhere('');
      setShowLog(false);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Target and wait price ── */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Tag size={13} /> Target (USD)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={targetPrice ?? ''}
              onChange={(e) => onTargetPriceChange(e.target.value)}
              placeholder="Normal price"
              className={input}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Timer size={13} /> Wait for (USD)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={waitPrice ?? ''}
              onChange={(e) => onWaitPriceChange(e.target.value)}
              placeholder="Sale price"
              className={input}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          {pctOff != null
            ? `This one realistically goes ${pctOff}% off. Below ${formatUSD(waitUSD, { round: true })} is a buy; between that and ${formatUSD(targetUSD, { round: true })} is fair but worth waiting.`
            : hasTarget
              ? 'Add a wait price if this item goes on sale often — some discount far more than others.'
              : 'Set a target once. The check below compares any local price against it.'}
        </p>
        {targetLocal != null && (
          <p className="text-xs text-gray-400 mt-0.5">
            Target ≈ {formatLocal(targetLocal, currency)} at today's rate.
          </p>
        )}
      </div>

      {/* ── Deal check ── */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Price check</span>
          <span className="text-xs text-gray-400">
            {ratesAreLive
              ? `Rates ${ratesUpdatedAt ? formatDay(new Date(ratesUpdatedAt)) : 'live'}`
              : 'Offline rates'}
          </span>
        </div>

        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <select
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className={input}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={decimalsFor(currency) === 0 ? '1' : '0.01'}
            value={localPrice}
            onChange={(e) => setLocalPrice(e.target.value)}
            placeholder={`Price in ${currencyMeta(currency).name}`}
            className={input}
          />
        </div>

        {enteredUSD != null && Number.isFinite(enteredUSD) && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                {formatUSD(enteredUSD)}
              </span>
              {currency !== BASE_CURRENCY && (
                <span className="text-xs text-gray-400">
                  1 USD = {rate.toLocaleString('en-US', { maximumFractionDigits: 2 })} {currency}
                </span>
              )}
            </div>

            {verdict ? (
              <div className={`rounded-lg px-3 py-2 ${VERDICT_CLASSES[verdict.tone]}`}>
                <div className="text-sm font-semibold">{verdict.label}</div>
                <div className="text-xs opacity-80">
                  {verdict.waitPrice != null
                    ? `${delta} · wait price ${formatUSD(verdict.waitPrice, { round: true })}`
                    : `${delta} (${formatUSD(targetUSD)})`}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Set a target price above to get a good-deal verdict.
              </p>
            )}

            {onLogPurchase && (
              showLog ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={input}
                  />
                  <input
                    type="text"
                    value={where}
                    onChange={(e) => setWhere(e.target.value)}
                    placeholder="Where? e.g. Decathlon, Bangkok"
                    className={input}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleLog}
                      disabled={logging || disabled}
                      className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 active:bg-green-700"
                    >
                      {logging ? 'Saving…' : `Log ${formatUSD(enteredUSD)} purchase`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLog(false)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 border border-gray-200 dark:border-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLog(true)}
                  disabled={disabled}
                  className="w-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  I bought it at this price
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* ── Purchase history ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Receipt size={13} /> Purchase History
          </label>
          {purchases.length > 1 && (
            <span className="text-xs text-gray-400">{formatUSD(totalSpent)} total</span>
          )}
        </div>

        {sortedPurchases.length === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2.5">
            Nothing logged yet. Enter a price above and tap “I bought it at this price.”
          </p>
        ) : (
          <div className="border border-gray-100 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {sortedPurchases.map((p, i) => (
              <div key={p.id || i} className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatUSD(p.amountUSD)}
                    </span>
                    {p.currency && p.currency !== BASE_CURRENCY && (
                      <span className="text-xs text-gray-400">
                        {formatLocal(p.amountLocal, p.currency)}
                      </span>
                    )}
                    {i === 0 && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                        latest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {formatDay(p.date) || 'No date'}{p.where ? ` · ${p.where}` : ''}
                  </div>
                </div>
                <DealBadge priceUSD={p.amountUSD} targetUSD={targetUSD} waitUSD={waitUSD} />
                {onRemovePurchase && (
                  <button
                    type="button"
                    onClick={() => onRemovePurchase(p.id)}
                    aria-label="Delete this purchase"
                    className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {lastPaid && hasTarget && (
          <p className="text-xs text-gray-400 mt-1.5">
            Last paid {formatUSD(lastPaid.amountUSD)} · target {formatUSD(targetUSD)}
          </p>
        )}
      </div>
    </div>
  );
}
