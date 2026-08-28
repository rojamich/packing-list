import { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw, Check, Shirt, Pencil, GripVertical, Minus, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { setPackState, resetAllPacked, reorderItems } from '../data/store';
import { getPackState, cyclePack, stepPack, packTotals } from '../lib/packing';
import useLongPressReorder from '../hooks/useLongPressReorder';
import ItemModal from '../components/ItemModal';

export default function Pack() {
  const { items, bags, loading } = useData();

  const [search,       setSearch]       = useState('');
  const [personFilter, setPersonFilter] = useState('All');
  const [bagFilter,    setBagFilter]    = useState('All');
  const [resetting,    setResetting]    = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [writeError,   setWriteError]   = useState(null);

  // Offline edits are queued by Firestore and settle later, so this only fires
  // on a real rejection (permissions, quota) — which would otherwise vanish.
  const guard = useMemo(() => (fn) => async (...args) => {
    try {
      setWriteError(null);
      await fn(...args);
    } catch (e) {
      setWriteError(e?.message || 'That change did not save.');
    }
  }, []);

  const filtering = search !== '' || personFilter !== 'All' || bagFilter !== 'All';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const ms = !q || String(item.name || '').toLowerCase().includes(q);
      const mp = personFilter === 'All' || item.person === personFilter || item.person === 'Both';
      const mb = bagFilter === 'All' || (item.inBag || 'Unassigned') === bagFilter;
      return ms && mp && mb;
    });
  }, [items, search, personFilter, bagFilter]);

  const bagOrder = useMemo(() => bags.map((b) => b.name), [bags]);

  const grouped = useMemo(() => {
    const byBag = {};
    filtered.forEach((item) => {
      const b = item.inBag || 'Unassigned';
      (byBag[b] ||= []).push(item);
    });
    const ordered = bagOrder.filter((b) => byBag[b]).map((b) => [b, byBag[b]]);
    const rest    = Object.entries(byBag).filter(([b]) => !bagOrder.includes(b));
    return [...ordered, ...rest];
  }, [filtered, bagOrder]);

  // Progress counts units, not rows — 1 of 2 shorts is half packed, not unpacked.
  const stats = useMemo(() => packTotals(filtered), [filtered]);
  const packedPct = stats.total > 0 ? (stats.packed / stats.total) * 100 : 0;
  const wornPct   = stats.total > 0 ? (stats.worn   / stats.total) * 100 : 0;
  const complete  = stats.total > 0 && stats.done === stats.total;

  const allBagNames = useMemo(() => {
    const names = new Set(items.map((i) => i.inBag || 'Unassigned'));
    const ordered = bagOrder.filter((b) => names.has(b));
    const rest    = [...names].filter((b) => !bagOrder.includes(b));
    return [...ordered, ...rest];
  }, [items, bagOrder]);

  const handleReorder = useMemo(() => guard(reorderItems), [guard]);
  const handleSetPack = useMemo(() => guard(setPackState), [guard]);

  // Only the rows actually on screen. This button sits directly beneath the
  // person and bag filters, so resetting the whole collection from here quietly
  // wiped the other person's packing too.
  const resetTargets = useMemo(
    () => filtered.filter((i) => getPackState(i).doneQty > 0),
    [filtered],
  );

  // Matches the tap-again pattern used for item and bag deletes, instead of a
  // blocking browser dialog that can't say how many rows it is about to touch.
  useEffect(() => {
    if (!confirmReset) return undefined;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  // Changing a filter changes what the button would do, so disarm it.
  useEffect(() => { setConfirmReset(false); }, [search, personFilter, bagFilter]);

  async function handleReset() {
    if (resetTargets.length === 0) return;
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    setResetting(true);
    setWriteError(null);
    try { await resetAllPacked(resetTargets); }
    catch (e) { setWriteError(e?.message || 'Could not reset.'); }
    finally { setResetting(false); }
  }

  function bagEmoji(name) {
    return bags.find((b) => b.name === name)?.emoji || (name === 'Unassigned' ? '📦' : '🎒');
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10 px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pack Mode</h1>
          <button
            onClick={handleReset}
            disabled={resetting || resetTargets.length === 0}
            className={`flex items-center gap-1.5 text-sm disabled:opacity-40 ${
              confirmReset
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-gray-500 dark:text-gray-500 dark:text-gray-400 active:text-gray-700'
            }`}
          >
            <RotateCcw size={14} />
            {confirmReset
              ? `Tap again to reset ${resetTargets.length}`
              : filtering
                ? `Reset ${resetTargets.length} shown`
                : `Reset all ${resetTargets.length}`}
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {['All', 'Mike', 'Jen'].map((p) => (
            <Pill key={p} label={p} active={personFilter === p} onClick={() => setPersonFilter(p)} />
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <Pill label="All Bags" active={bagFilter === 'All'} onClick={() => setBagFilter('All')} />
          {allBagNames.map((b) => (
            <Pill key={b} label={b} active={bagFilter === b} onClick={() => setBagFilter(b)} />
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-3 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-500 dark:text-gray-400">
              {stats.packed > 0 && <span className="text-green-600 font-medium">{stats.packed} packed</span>}
              {stats.packed > 0 && stats.worn > 0 && <span className="text-gray-500 dark:text-gray-600"> · </span>}
              {stats.worn > 0 && <span className="text-indigo-500 font-medium">{stats.worn} worn</span>}
              {stats.done === 0 && <span>Not started</span>}
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {stats.done}/{stats.total}
              {complete && ' 🎉'}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all"  style={{ width: `${packedPct}%` }} />
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${wornPct}%` }} />
          </div>
          <div className="flex gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Packed in bag</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Wearing on travel day</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="px-4 space-y-3">
        {writeError && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
            {writeError}
          </p>
        )}

        {grouped.map(([bag, bagItems]) => (
          <BagGroup
            key={bag}
            bag={bag}
            emoji={bagEmoji(bag)}
            items={bagItems}
            reorderable={!filtering}
            onEdit={setEditing}
            onReorder={handleReorder}
            onSetPack={handleSetPack}
          />
        ))}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <p className="text-4xl mb-3">{items.length === 0 ? '📦' : '🔍'}</p>
            <p className="font-medium">{items.length === 0 ? 'No items to pack' : 'No items match your filters'}</p>
            <p className="text-sm mt-1">{items.length === 0 ? 'Add items in the Gear tab first' : 'Try a different filter'}</p>
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4 px-4 leading-relaxed">
          Tap to pack · tap again for worn on travel day · use −/+ to pack part of a set
          <br />
          {filtering
            ? 'Clear filters to drag items into a new order'
            : 'Press and hold a row to drag it into a new order'}
        </p>
      )}

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── One bag's list ────────────────────────────────────────────────
// Each group owns its own reorder gesture; items only ever move within a bag.

function BagGroup({ bag, emoji, items, reorderable, onEdit, onReorder, onSetPack }) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const { dragId, order, getRowProps } = useLongPressReorder(ids, onReorder, reorderable);

  // While dragging, render the live order instead of what Firestore last sent.
  const rows = useMemo(() => {
    if (!order) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [items, order]);

  const totals = packTotals(items);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-gray-800">
        <span className="font-semibold text-gray-900 dark:text-white text-sm">{emoji} {bag}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{totals.done}/{totals.total}</span>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {rows.map((item) => (
          <PackRow
            key={item.id}
            item={item}
            dragging={dragId === item.id}
            lifted={dragId !== null}
            rowProps={getRowProps(item.id)}
            onEdit={onEdit}
            onSetPack={onSetPack}
          />
        ))}
      </div>
    </div>
  );
}

function PackRow({ item, dragging, lifted, rowProps, onEdit, onSetPack }) {
  const { ref, ...handlers } = rowProps;
  const state = getPackState(item);
  const multi = state.qty > 1;

  function toggle() {
    onSetPack(item.id, cyclePack(item));
  }

  function step(delta) {
    onSetPack(item.id, stepPack(item, delta));
  }

  const subline =
    state.worn                 ? `Wearing all ${state.qty}` :
    multi                      ? `${state.packedQty} of ${state.qty} packed` :
                                 null;

  return (
    <div
      ref={ref}
      {...handlers}
      onClick={toggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      style={{ touchAction: lifted ? 'none' : 'pan-y' }}
      className={`flex items-center gap-3 px-4 py-3 text-left transition-shadow select-none ${
        dragging
          ? 'relative z-20 bg-blue-50 dark:bg-blue-900/30 shadow-lg rounded-xl'
          : 'active:bg-gray-50 dark:active:bg-gray-800'
      }`}
    >
      <StatusCircle state={state} />

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium transition-colors ${
          state.status === 'unpacked'
            ? 'text-gray-900 dark:text-white'
            : state.status === 'partial'
              ? 'text-gray-700 dark:text-gray-200'
              : 'text-gray-500 dark:text-gray-500 line-through'
        }`}>
          {item.name}
          {multi && <span className="text-gray-500 dark:text-gray-400 font-normal no-underline"> ×{state.qty}</span>}
        </div>
        {subline && (
          <div className={`text-xs mt-0.5 ${state.status === 'partial' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
            {subline}
          </div>
        )}
      </div>

      {multi && !state.worn && (
        <div data-no-drag className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <StepButton
            label={`Unpack one ${item.name}`}
            disabled={state.packedQty === 0}
            onClick={() => step(-1)}
          >
            <Minus size={14} />
          </StepButton>
          <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-500 dark:text-gray-400 w-8 text-center">
            {state.packedQty}/{state.qty}
          </span>
          <StepButton
            label={`Pack one ${item.name}`}
            disabled={state.packedQty >= state.qty}
            onClick={() => step(1)}
          >
            <Plus size={14} />
          </StepButton>
        </div>
      )}

      {state.worn && (
        <span className="flex-shrink-0 text-xs bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium no-underline">
          worn
        </span>
      )}

      <button
        data-no-drag
        onClick={(e) => { e.stopPropagation(); onEdit(item); }}
        aria-label={`Edit ${item.name}`}
        className="flex-shrink-0 p-1.5 -mr-1 text-gray-500 hover:text-blue-600 dark:text-gray-600 dark:hover:text-blue-400"
      >
        <Pencil size={15} />
      </button>

      <GripVertical
        size={15}
        className={`flex-shrink-0 -ml-1 transition-opacity ${dragging ? 'text-blue-500' : 'text-gray-300 dark:text-gray-700'}`}
      />
    </div>
  );
}

function StepButton({ children, label, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-500 dark:text-gray-400 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-800"
    >
      {children}
    </button>
  );
}

function StatusCircle({ state }) {
  const { status, packedQty, qty } = state;
  // Partial gets an amber ring with a dot scaled to how much is in the bag —
  // the exact count lives in the subline and the stepper, where it fits.
  const fill = qty > 0 ? packedQty / qty : 0;

  return (
    <div className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
      status === 'packed'  ? 'bg-green-500 border-green-500' :
      status === 'worn'    ? 'bg-indigo-500 border-indigo-500' :
      status === 'partial' ? 'border-amber-500' :
                             'border-gray-300 dark:border-gray-600'
    }`}>
      {status === 'packed'  && <Check size={13} className="text-white" strokeWidth={3} />}
      {status === 'worn'    && <Shirt size={13} className="text-white" />}
      {status === 'partial' && (
        <span
          className="rounded-full bg-amber-500 transition-all"
          style={{ width: `${6 + fill * 10}px`, height: `${6 + fill * 10}px` }}
        />
      )}
    </div>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}
