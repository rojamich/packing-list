import { useMemo, useState } from 'react';
import { Tag, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import ItemModal from '../components/ItemModal';
import { replaceByDate, formatMonthYear, lastPurchase, DEFAULT_LIFE_MONTHS } from '../lib/dates';
import { getUrgency, replaceState, replacementCost } from '../lib/replace';
import { formatUSD, formatLocal, fromUSD, BASE_CURRENCY, currencyMeta } from '../lib/money';

const URGENCY_CONFIG = {
  now:     { label: 'Replace Now', bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500',    order: 0 },
  overdue: { label: 'Overdue',     bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500',    order: 1 },
  soon:    { label: '< 3 months',  bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500', order: 2 },
  watch:   { label: '< 6 months',  bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500',  order: 3 },
};

export default function Replace() {
  const { items, loading, rates, activeCurrency } = useData();
  const [selectedItem, setSelectedItem] = useState(null);
  const [showNoDates, setShowNoDates]   = useState(false);
  const [showNoTarget, setShowNoTarget] = useState(false);

  const actionable = useMemo(() => (
    items
      .map((item) => ({ ...item, urgency: getUrgency(item) }))
      .filter((item) => item.urgency && item.urgency !== 'ok')
      .sort((a, b) => {
        const ao = URGENCY_CONFIG[a.urgency]?.order ?? 99;
        const bo = URGENCY_CONFIG[b.urgency]?.order ?? 99;
        return ao - bo || String(a.name).localeCompare(String(b.name));
      })
  ), [items]);

  // What it costs to replace everything currently flagged. Items without a
  // target price fall back to what was last paid, and are counted separately
  // so the number is never quietly wrong.
  // Prices only the units actually flagged. Two pairs of shorts with one worn
  // out costs one pair, not two.
  const budget = useMemo(() => {
    let known = 0, guessed = 0, unknown = 0;
    actionable.forEach((item) => {
      const { usd, basis } = replacementCost(item, lastPurchase(item)?.amountUSD);
      if (basis === 'target') known += usd;
      else if (basis === 'paid') guessed += usd;
      else unknown += 1;
    });
    return { known, guessed, unknown, total: known + guessed };
  }, [actionable]);

  const noDates = useMemo(() => (
    items.filter((i) => {
      const life = Number(i.estLifeMonths) || DEFAULT_LIFE_MONTHS;
      return !replaceByDate(i) && i.status !== 'replace' && life < 36;
    })
  ), [items]);

  const noTarget = useMemo(() => (
    items.filter((i) => {
      const t = Number(i.targetPrice);
      return !(Number.isFinite(t) && t > 0);
    })
  ), [items]);

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Replace Tracker</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tap any item to log a purchase or set its target price</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="px-4 space-y-3 mt-3">
        {!loading && actionable.length === 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-semibold text-green-800 dark:text-green-300">All clear!</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              No items flagged for replacement right now.
            </p>
          </div>
        )}

        {/* ── Replacement budget ── */}
        {actionable.length > 0 && budget.total > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Cost to replace all flagged</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatUSD(budget.total, { round: true })}
              </span>
            </div>
            {activeCurrency !== BASE_CURRENCY && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                ≈ {formatLocal(fromUSD(budget.total, activeCurrency, rates), activeCurrency, { round: true })} in {currencyMeta(activeCurrency).name}
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {formatUSD(budget.known, { round: true })} from target prices
              {budget.guessed > 0 && ` · ${formatUSD(budget.guessed, { round: true })} estimated from what you last paid`}
              {budget.unknown > 0 && ` · ${budget.unknown} item${budget.unknown === 1 ? '' : 's'} with no price yet`}
            </p>
          </div>
        )}

        {/* ── Needs attention ── */}
        {actionable.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">
                Needs Attention ({actionable.length})
              </span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {actionable.map((item) => {
                const cfg = URGENCY_CONFIG[item.urgency];
                const rb = formatMonthYear(replaceByDate(item));
                const paid = lastPurchase(item);
                const target = Number(item.targetPrice);
                const hasTarget = Number.isFinite(target) && target > 0;
                const rs = replaceState(item);

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {item.inBag || 'Unassigned'}
                        {rs.some && ` · ${rs.replaceQty} of ${rs.qty} worn out`}
                        {rb && ` · Replace by ${rb}`}
                        {!rb && !rs.any && ' · No purchase logged'}
                      </div>
                      <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                        {hasTarget ? (
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                            <Tag size={11} /> Target {formatUSD(target, { round: true })}
                            {activeCurrency !== BASE_CURRENCY && (
                              <span className="text-gray-500 dark:text-gray-400 font-normal">
                                ({formatLocal(fromUSD(target, activeCurrency, rates), activeCurrency, { round: true })})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            <AlertCircle size={11} /> No target price
                          </span>
                        )}
                        {paid && (
                          <span className="text-gray-500 dark:text-gray-400">Paid {formatUSD(paid.amountUSD, { round: true })}</span>
                        )}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                      {rs.some ? `Replace ${rs.replaceQty}` : cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Gaps to fill in ── */}
        {noTarget.length > 0 && (
          <Collapsible
            title={`No Target Price (${noTarget.length})`}
            open={showNoTarget}
            onToggle={() => setShowNoTarget((v) => !v)}
            items={noTarget}
            onSelect={setSelectedItem}
            subline={(i) => `Set what a good replacement costs · est. life ${Number(i.estLifeMonths) || DEFAULT_LIFE_MONTHS} mo`}
          />
        )}

        {noDates.length > 0 && (
          <Collapsible
            title={`No Purchase Logged (${noDates.length})`}
            open={showNoDates}
            onToggle={() => setShowNoDates((v) => !v)}
            items={noDates}
            onSelect={setSelectedItem}
            subline={(i) => `Est. life ${Number(i.estLifeMonths) || DEFAULT_LIFE_MONTHS} months · tap to log what you paid`}
          />
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">💡 How this works</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
            Log what you paid and the replace-by date calculates itself from the estimated life span.
            Set a <strong>target price</strong> and the price check inside any item will tell you whether
            the price on the shelf — in any currency — is a good deal. Items marked “Replace” always
            show here regardless of dates.
          </p>
        </div>
      </div>

      {selectedItem && (
        <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

function Collapsible({ title, open, onToggle, items, onSelect, subline }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-gray-800"
      >
        <span className="font-semibold text-gray-900 dark:text-white text-sm">{title}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {items.slice(0, 40).map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-300 dark:bg-gray-600" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subline(item)}</div>
              </div>
            </button>
          ))}
          {items.length > 40 && (
            <p className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
              +{items.length - 40} more — use the Gear tab to work through the rest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
