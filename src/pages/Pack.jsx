import { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw, Check, Shirt, Pencil, GripVertical, Minus, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { setPackState, resetAllPacked, reorderItems, setBagPacked, resetPackedBags } from '../data/store';
import { buildPackGroups } from '../lib/bags';
import { getPackState, cyclePack, stepPack, packTotals } from '../lib/packing';
import useLongPressReorder from '../hooks/useLongPressReorder';
import ItemModal from '../components/ItemModal';
import BagModal from '../components/BagModal';

export default function Pack() {
  const { items, bags, loading } = useData();

  const [search,       setSearch]       = useState('');
  const [personFilter, setPersonFilter] = useState('All');
  const [bagFilter,    setBagFilter]    = useState('All');
  const [resetting,    setResetting]    = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [editingBag,   setEditingBag]   = useState(null);
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

  const groups = useMemo(() => buildPackGroups(bags, filtered, packTotals), [bags, filtered]);

  // Progress counts units, not rows — 1 of 2 shorts is half packed, not
  // unpacked — and a sub-bag is a single unit in its parent, matching what each
  // group header shows. Summing the groups keeps the two numbers consistent.
  const stats = useMemo(() => {
    let total = 0, packed = 0, worn = 0;
    groups.forEach((g) => {
      const t = packTotals(g.items);
      total  += t.total + g.subBags.length;
      packed += t.packed + g.subBags.filter((s) => s.packed).length;
      worn   += t.worn;
    });
    return { total, packed, worn, done: packed + worn };
  }, [groups]);
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
  const handleToggleSubBag = useMemo(
    () => guard((bag, packed) => setBagPacked(bag.id, packed)),
    [guard],
  );

  // Sub-bags currently shown, so a reset unticks them alongside the items.
  const shownSubBags = useMemo(
    () => groups.flatMap((g) => g.subBags.filter((s) => s.packed).map((s) => s.bag)),
    [groups],
  );

  // Only the rows actually on screen. This button sits directly beneath the
  // person and bag filters, so resetting the whole collection from here quietly
  // wiped the other person's packing too.
  const resetTargets = useMemo(
    () => filtered.filter((i) => getPackState(i).doneQty > 0),
    [filtered],
  );
  const resetCount = resetTargets.length + shownSubBags.length;

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
    if (resetCount === 0) return;
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    setResetting(true);
    setWriteError(null);
    try {
      await resetAllPacked(resetTargets);
      await resetPackedBags(shownSubBags);
    }
    catch (e) { setWriteError(e?.message || 'Could not reset.'); }
    finally { setResetting(false); }
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10 px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pack Mode</h1>
          <button
            onClick={handleReset}
            disabled={resetting || resetCount === 0}
            className={`flex items-center gap-1.5 text-sm disabled:opacity-40 ${
              confirmReset
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-gray-500 dark:text-gray-400 active:text-gray-700'
            }`}
          >
            <RotateCcw size={14} />
            {confirmReset
              ? `Tap again to reset ${resetCount}`
              : filtering
                ? `Reset ${resetCount} shown`
                : `Reset all ${resetCount}`}
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
            <span className="text-gray-500 dark:text-gray-400">
              {stats.packed > 0 && <span className="text-green-600 font-medium">{stats.packed} packed</span>}
              {stats.packed > 0 && stats.worn > 0 && <span className="text-gray-500 dark:text-gray-400"> · </span>}
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

        {groups.map((group, groupIndex) => (
          <BagGroup
            key={group.name}
            group={group}
            // Keeps each bag's sortOrder values in their own band. Reordering is
            // only enabled unfiltered, so this index is stable.
            orderBase={(groupIndex + 1) * 100000}
            reorderable={!filtering}
            onEdit={setEditing}
            onEditBag={setEditingBag}
            onReorder={handleReorder}
            onSetPack={handleSetPack}
            onToggleSubBag={handleToggleSubBag}
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
          Tap to pack · tap again for worn on travel day
          <br />
          On a set, the two counters split it between bag and body — 4 packed, 1 worn, 1 to go
          <br />
          {filtering
            ? 'Clear filters to drag items into a new order'
            : 'Press and hold a row to drag it into a new order'}
        </p>
      )}

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
      {editingBag && (
        <BagModal
          bag={editingBag}
          itemCount={items.filter((i) => i.inBag === editingBag.name).length}
          onClose={() => setEditingBag(null)}
        />
      )}
    </div>
  );
}

// ── One bag's list ────────────────────────────────────────────────
// Each group owns its own reorder gesture; items only ever move within a bag.

function BagGroup({ group, orderBase = 0, reorderable, onEdit, onEditBag, onReorder, onSetPack, onToggleSubBag }) {
  const { items, subBags, emoji, name, totals } = group;

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const commit = useMemo(() => (nextIds) => onReorder(nextIds, orderBase), [onReorder, orderBase]);
  const { dragId, order, getRowProps } = useLongPressReorder(ids, commit, reorderable);

  // While dragging, render the live order instead of what Firestore last sent.
  const rows = useMemo(() => {
    if (!order) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [items, order]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 dark:border-gray-800">
        <span className="font-semibold text-gray-900 dark:text-white text-sm">{emoji} {name}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {totals.done}/{totals.total}
        </span>
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

        {subBags.map((sub) => (
          <SubBagRow
            key={sub.bag.id}
            sub={sub}
            onToggle={onToggleSubBag}
            onEdit={onEdit}
            onEditBag={onEditBag}
            onSetPack={onSetPack}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A bag inside a bag. One tick packs the whole thing — on travel day you care
 * that the toiletries bag is in, not what's in it. Expand to work through its
 * contents, which are tracked on the sub-bag rather than the parent.
 */
function SubBagRow({ sub, onToggle, onEdit, onEditBag, onSetPack }) {
  const [open, setOpen] = useState(false);
  const { bag, items, totals, packed } = sub;
  const inner = items.length > 0 ? `${totals.done}/${totals.total} inside` : 'empty';

  return (
    <div className="bg-gray-50/60 dark:bg-gray-800/20">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onToggle(bag, !packed)}
          aria-pressed={packed ? 'true' : 'false'}
          aria-label={`${packed ? 'Unpack' : 'Pack'} ${bag.name}`}
          className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            packed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          {packed && <Check size={13} className="text-white" strokeWidth={3} />}
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 flex items-center gap-2 min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="text-base">{bag.emoji || '🎒'}</span>
          <span className="flex-1 min-w-0">
            <span className={`block text-sm font-medium truncate ${
              packed ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-white'
            }`}>
              {bag.name}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 no-underline">
              {inner}
            </span>
          </span>
          {open
            ? <ChevronDown size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
            : <ChevronRight size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />}
        </button>

        <button
          onClick={() => onEditBag(bag)}
          aria-label={`Edit ${bag.name}`}
          className="flex-shrink-0 p-1.5 -mr-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        >
          <Pencil size={15} />
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 pl-4">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Nothing assigned to this bag yet.
            </p>
          ) : (
            items.map((item) => (
              <PackRow
                key={item.id}
                item={item}
                dragging={false}
                lifted={false}
                rowProps={{ ref: () => {} }}
                onEdit={onEdit}
                onSetPack={onSetPack}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PackRow({ item, dragging, lifted, rowProps, onEdit, onSetPack }) {
  const { ref, ...handlers } = rowProps;
  const state = getPackState(item);
  const multi = state.qty > 1;

  const toggle = () => onSetPack(item.id, cyclePack(item));
  const step = (delta, which) => onSetPack(item.id, stepPack(item, delta, which));

  // What is actually true of this item, in the order you care about it.
  const parts = [];
  if (state.packedQty > 0) parts.push(`${state.packedQty} packed`);
  if (state.wornQty > 0) parts.push(`${state.wornQty} worn`);
  if (state.remaining > 0 && state.doneQty > 0) parts.push(`${state.remaining} to go`);

  const subline = multi
    ? (parts.length ? parts.join(' · ') : null)
    : state.status === 'worn' ? 'Wearing it' : null;

  const partial = state.remaining > 0 && state.doneQty > 0;
  const done = state.remaining === 0 && state.doneQty > 0;

  const pressed = state.doneQty === 0 ? 'false' : done ? 'true' : 'mixed';

  return (
    <div
      ref={ref}
      {...handlers}
      style={{ touchAction: lifted ? 'none' : 'pan-y' }}
      className={`px-4 py-3 transition-shadow select-none ${
        dragging
          ? 'relative z-20 bg-blue-50 dark:bg-blue-900/30 shadow-lg rounded-xl'
          : 'active:bg-gray-50 dark:active:bg-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* The toggle is its own button so the row can carry sibling controls
            without nesting them. No data-no-drag: press-and-hold still drags. */}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={pressed}
          className="flex-1 flex items-center gap-3 min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <StatusCircle state={state} />
          <span className="flex-1 min-w-0">
            <span className={`block text-sm font-medium transition-colors truncate ${
              state.doneQty === 0
                ? 'text-gray-900 dark:text-white'
                : done
                  ? 'text-gray-500 dark:text-gray-400 line-through'
                  : 'text-gray-700 dark:text-gray-200'
            }`}>
              {item.name}
              {multi && <span className="text-gray-500 dark:text-gray-400 font-normal no-underline"> ×{state.qty}</span>}
            </span>
            {subline && (
              <span className={`block text-xs mt-0.5 no-underline ${
                partial ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {subline}
              </span>
            )}
          </span>
        </button>

        {!multi && state.wornQty > 0 && (
          <span className="flex-shrink-0 text-xs bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
            worn
          </span>
        )}

        <button
          data-no-drag
          onClick={() => onEdit(item)}
          aria-label={`Edit ${item.name}`}
          className="flex-shrink-0 p-1.5 -mr-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
        >
          <Pencil size={15} />
        </button>

        <GripVertical
          size={15}
          className={`flex-shrink-0 -ml-1 transition-opacity ${dragging ? 'text-blue-500' : 'text-gray-300 dark:text-gray-700'}`}
        />
      </div>

      {/* Two independent counts need two controls, and they don't fit beside the
          name on a phone. Own line, indented under the item, only when there is
          more than one unit to split between bag and body. */}
      {multi && (
        <div data-no-drag className="flex items-center gap-2 mt-2 pl-10">
          <Counter
            noun="packed"
            icon={<Check size={12} strokeWidth={3} />}
            tone="text-green-600 dark:text-green-500"
            value={state.packedQty}
            total={state.qty}
            onDec={() => step(-1, 'packed')}
            onInc={() => step(1, 'packed')}
            decLabel={`Unpack one ${item.name}`}
            incLabel={`Pack one ${item.name}`}
            canDec={state.packedQty > 0}
            canInc={state.remaining > 0}
          />
          <Counter
            noun="worn"
            icon={<Shirt size={12} />}
            tone="text-indigo-600 dark:text-indigo-400"
            value={state.wornQty}
            onDec={() => step(-1, 'worn')}
            onInc={() => step(1, 'worn')}
            decLabel={`Stop wearing one ${item.name}`}
            incLabel={`Wear one ${item.name}`}
            canDec={state.wornQty > 0}
            canInc={state.wornQty < state.qty}
          />
        </div>
      )}
    </div>
  );
}

/** A −/+ pair around one count. `total` is shown only where there is one. */
function Counter({ noun, icon, tone, value, total, onDec, onInc, decLabel, incLabel, canDec, canInc }) {
  return (
    <div className="flex items-center gap-1">
      <StepButton label={decLabel} disabled={!canDec} onClick={onDec}>
        <Minus size={14} />
      </StepButton>
      <span className={`flex items-center gap-1 text-xs font-semibold tabular-nums justify-center ${total != null ? 'w-12' : 'w-9'} ${
        value > 0 ? tone : 'text-gray-400 dark:text-gray-600'
      }`}>
        {icon}
        {total != null ? `${value}/${total}` : value}
        <span className="sr-only">{noun}</span>
      </span>
      <StepButton label={incLabel} disabled={!canInc} onClick={onInc}>
        <Plus size={14} />
      </StepButton>
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
      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-800"
    >
      {children}
    </button>
  );
}

function StatusCircle({ state }) {
  const { status, doneQty, qty, wornQty, packedQty } = state;
  // Partial gets an amber ring with a dot scaled to how much is handled — the
  // exact split lives in the subline and the counters, where it has room.
  const fill = qty > 0 ? doneQty / qty : 0;
  // A fully handled item that is mostly worn reads as worn, mostly packed reads
  // as packed. Either way the subline carries the breakdown.
  const leansWorn = wornQty > packedQty;
  const showCheck = status === 'packed' || (status === 'mixed' && !leansWorn);
  const showShirt = status === 'worn' || (status === 'mixed' && leansWorn);

  return (
    <div className={`w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
      showShirt            ? 'bg-indigo-500 border-indigo-500' :
      showCheck            ? 'bg-green-500 border-green-500' :
      status === 'partial' ? 'border-amber-500' :
                             'border-gray-300 dark:border-gray-600'
    }`}>
      {showCheck && <Check size={13} className="text-white" strokeWidth={3} />}
      {showShirt && <Shirt size={13} className="text-white" />}
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
