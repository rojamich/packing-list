import { useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { RefreshCw, Globe, Database, ChevronRight } from 'lucide-react';
import { auth } from '../firebase';
import { useData } from '../context/DataContext';
import { useUpdate } from '../context/UpdateContext';
import { APP_VERSION, BUILD_ID, formatBuildDate } from '../lib/version';
import { seedDatabase } from '../data/store';
import { packTotals } from '../lib/packing';
import { replaceByDate, daysUntil } from '../lib/dates';
import { replaceState } from '../lib/replace';
import { CURRENCIES, currencyMeta, formatUSD, formatLocal, fromUSD, BASE_CURRENCY } from '../lib/money';

export default function Dashboard() {
  const {
    items, bags, loading, rates, activeCurrency, setActiveCurrency,
    refreshRates, ratesAreLive,
  } = useData();

  const [seeding, setSeeding]       = useState(false);
  const [seedNote, setSeedNote]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    const packing = packTotals(items);

    const toBuy = items.filter((i) => i.status === 'buy').length;
    const toReplace = items.filter((i) => {
      if (replaceState(i).any) return true;
      const rb = replaceByDate(i);
      return rb && daysUntil(rb) <= 90;
    }).length;

    // What the kit cost, and what rebuilding it would cost at full price
    // versus holding out for each item's sale price.
    let spent = 0, targetValue = 0, waitValue = 0, missingTarget = 0;
    items.forEach((i) => {
      (i.purchases || []).forEach((p) => { spent += Number(p.amountUSD) || 0; });
      const qty = Number(i.qty) || 1;
      const t = Number(i.targetPrice);
      if (Number.isFinite(t) && t > 0) {
        targetValue += t * qty;
        const w = Number(i.waitPrice);
        waitValue += (Number.isFinite(w) && w > 0 && w < t ? w : t) * qty;
      } else {
        missingTarget += 1;
      }
    });

    // Use the bags' own order and icons, the way Gear and Pack do. Sorting
    // alphabetically and dropping the emoji made the same data look like a
    // different list three lines further down the same scroll.
    const counts = {};
    items.forEach((i) => {
      const bag = i.inBag || 'Unassigned';
      counts[bag] = (counts[bag] || 0) + 1;
    });
    const known = bags.filter((b) => counts[b.name])
      .map((b) => ({ name: b.name, emoji: b.emoji || '🎒', count: counts[b.name] }));
    const orphaned = Object.keys(counts)
      .filter((n) => n !== 'Unassigned' && !bags.some((b) => b.name === n))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ name: n, emoji: '🎒', count: counts[n] }));
    const unassigned = counts.Unassigned
      ? [{ name: 'Unassigned', emoji: '📦', count: counts.Unassigned }]
      : [];
    const byBag = [...known, ...orphaned, ...unassigned];

    return {
      total: items.length,
      packing,
      toBuy,
      toReplace,
      spent,
      targetValue,
      waitValue,
      missingTarget,
      byBag,
      mike: items.filter((i) => i.person === 'Mike').length,
      jen: items.filter((i) => i.person === 'Jen').length,
      shared: items.filter((i) => i.person === 'Both').length,
    };
  }, [items, bags]);

  async function handleSeed() {
    setSeeding(true);
    setSeedNote(null);
    try {
      const res = await seedDatabase();
      if (res.skipped) setSeedNote(`Already have ${res.count} items — nothing imported.`);
    } catch (e) {
      setSeedNote(e?.message || 'Import failed.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleRefreshRates() {
    setRefreshing(true);
    try { await refreshRates({ force: true }); }
    finally { setRefreshing(false); }
  }

  const isEmpty = !loading && items.length === 0;
  const pct = stats.packing.total > 0
    ? Math.round((stats.packing.done / stats.packing.total) * 100)
    : 0;

  return (
    <div className="p-4 space-y-4 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mike &amp; Jen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Nomad Kit &amp; Inventory</p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mt-1"
        >
          Sign out
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isEmpty && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-3">📋</div>
          <p className="text-blue-800 dark:text-blue-200 font-medium mb-1">No items yet</p>
          <p className="text-sm text-blue-600 dark:text-blue-300 mb-4">
            Import your packing list to get started.
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
          >
            {seeding ? 'Importing…' : 'Import Packing List'}
          </button>
          {seedNote && <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">{seedNote}</p>}
        </div>
      )}

      {!loading && stats.total > 0 && (
        <>
          {/* ── Where we are ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                <Globe size={14} className="text-gray-500 dark:text-gray-400" /> Shopping currency
              </span>
              <button
                onClick={handleRefreshRates}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 disabled:opacity-40 active:text-gray-600"
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                {ratesAreLive ? 'Update rates' : 'Get live rates'}
              </button>
            </div>
            <select
              value={activeCurrency}
              onChange={(e) => setActiveCurrency(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Target prices show in this currency wherever you are.
              {!ratesAreLive && ' Using built-in fallback rates until the first update.'}
            </p>
          </div>

          {/* ── Counts ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Items" value={stats.total} color="text-gray-900 dark:text-white" />
            <StatCard
              label={`Packed · ${stats.packing.done}/${stats.packing.total}`}
              value={`${pct}%`}
              color={pct === 100 ? 'text-green-600' : 'text-blue-600'}
            />
            <StatCard label="Need to Buy" value={stats.toBuy} color={stats.toBuy > 0 ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'} />
            <StatCard label="Replace Soon" value={stats.toReplace} color={stats.toReplace > 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} />
          </div>

          {/* ── Money ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Kit Value</h2>
            <div className="space-y-2.5">
              <MoneyRow
                label="Logged spend"
                usd={stats.spent}
                currency={activeCurrency}
                rates={rates}
                hint="Everything you've recorded paying"
              />
              <MoneyRow
                label="Rebuild at target"
                usd={stats.targetValue}
                currency={activeCurrency}
                rates={rates}
                hint={stats.missingTarget > 0
                  ? `${stats.missingTarget} item${stats.missingTarget === 1 ? ' still needs' : 's still need'} a target price`
                  : 'Every item has a target price'}
              />
              {stats.waitValue > 0 && stats.waitValue < stats.targetValue && (
                <MoneyRow
                  label="…if you wait for sales"
                  usd={stats.waitValue}
                  currency={activeCurrency}
                  rates={rates}
                  hint={`Saves ${formatUSD(stats.targetValue - stats.waitValue, { round: true })} by holding out`}
                />
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500 dark:text-gray-400">Packing progress</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {stats.packing.done} / {stats.packing.total}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Counted by individual pieces, not by line.</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">By Owner</h2>
            <div className="space-y-2.5">
              <Row label="Mike" value={stats.mike} icon="🎒" />
              <Row label="Jen" value={stats.jen} icon="👜" />
              <Row label="Shared" value={stats.shared} icon="🤝" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">By Bag</h2>
            <div className="space-y-2.5">
              {stats.byBag.map((b) => (
                <Row key={b.name} label={b.name} value={b.count} icon={b.emoji} />
              ))}
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-1">✈️ Budget airline tip</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Wear fleece + rain jacket on travel days → keeps bag under 7 kg.
            </p>
          </div>
        </>
      )}

      {/* Outside the has-items block on purpose: restoring a backup into an
          empty account has to be reachable when there's nothing to show. */}
      <Link
        to="/data"
        className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-800"
      >
        <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <Database size={17} className="text-blue-600 dark:text-blue-400" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-gray-900 dark:text-white text-sm">
            Backup &amp; Bulk Edit
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Export a backup · set prices in a spreadsheet · import
          </span>
        </span>
        <ChevronRight size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
      </Link>

      <VersionFooter />
    </div>
  );
}

/** Confirms which build this device is actually running. */
function VersionFooter() {
  const { updateAvailable, checking, check, applyUpdate, latest } = useUpdate();

  return (
    <div className="pt-2 pb-1 text-center space-y-1">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        v{APP_VERSION} · built {formatBuildDate()}
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{BUILD_ID}</p>

      {updateAvailable ? (
        <button
          onClick={applyUpdate}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 underline"
        >
          Update to {latest?.version ? `v${latest.version}` : 'the latest version'}
        </button>
      ) : (
        <button
          onClick={check}
          disabled={checking}
          className="text-xs text-gray-500 dark:text-gray-400 underline disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function MoneyRow({ label, usd, currency, rates, hint }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-gray-600 dark:text-gray-300 text-sm">{label}</div>
        {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</div>}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-semibold text-gray-900 dark:text-white text-sm">
          {formatUSD(usd, { round: true })}
        </div>
        {currency !== BASE_CURRENCY && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatLocal(fromUSD(usd, currency, rates), currency, { round: true })} {currencyMeta(currency).code}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, icon }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600 dark:text-gray-300 text-sm">
        {icon && <span className="mr-1.5">{icon}</span>}
        {label}
      </span>
      <span className="font-semibold text-gray-900 dark:text-white text-sm">{value}</span>
    </div>
  );
}
