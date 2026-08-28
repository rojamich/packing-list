import { useMemo, useState } from 'react';
import { Search, Plus, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { useData } from '../context/DataContext';
import { formatUSD, waitPctOff } from '../lib/money';
import { lastPurchase } from '../lib/dates';
import ItemModal from '../components/ItemModal';
import BagModal  from '../components/BagModal';

const STATUS_COLORS = {
  have:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  buy:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  replace: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};
const STATUS_LABELS = { have: 'Have It', buy: 'Buy', replace: 'Replace' };

const COND_DOT = {
  new:  'bg-blue-500',
  good: 'bg-green-500',
  fair: 'bg-amber-500',
  poor: 'bg-red-500',
};

export default function Gear() {
  const { items, bags, loading } = useData();

  const [view,         setView]         = useState('items'); // 'items' | 'bags'
  const [search,       setSearch]       = useState('');
  const [personFilter, setPersonFilter] = useState('All');
  const [expanded,     setExpanded]     = useState({});

  const [selectedItem, setSelectedItem] = useState(null);
  const [addingItem,   setAddingItem]   = useState(false);
  const [selectedBag,  setSelectedBag]  = useState(null);
  const [addingBag,    setAddingBag]    = useState(false);

  // ── Items view ────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const ms = !q || String(item.name || '').toLowerCase().includes(q);
      const mp = personFilter === 'All' || item.person === personFilter;
      return ms && mp;
    });
    const groups = {};
    filtered.forEach((item) => {
      const cat = item.category || 'Other';
      (groups[cat] ||= []).push(item);
    });
    // Gear is a reference list, so alphabetical beats packing order here.
    Object.values(groups).forEach((list) =>
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [items, search, personFilter]);

  const toggleGroup = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  // ── Bags view ─────────────────────────────────────────────────────
  const bagItemCounts = useMemo(() => {
    const counts = {};
    items.forEach((i) => { const b = i.inBag || '__none__'; counts[b] = (counts[b] || 0) + 1; });
    return counts;
  }, [items]);

  const unassignedCount = bagItemCounts['__none__'] || 0;

  // Expand state shared for both views — use a simple getter with default=true
  function isExpanded(key) { return expanded[key] !== false; }

  return (
    <div className="pb-6">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10 px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Gear</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">{items.length} items</span>
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-200 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {['items', 'bags'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                view === v
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {v === 'items' ? `Items (${items.length})` : `Bags (${bags.length})`}
            </button>
          ))}
        </div>

        {/* Items-only filters */}
        {view === 'items' && (
          <>
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
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {['All', 'Mike', 'Jen', 'Both'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPersonFilter(p)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    personFilter === p
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Items view ── */}
      {view === 'items' && !loading && (
        <div className="px-4 space-y-2">
          {grouped.map(([category, catItems]) => (
            <div key={category} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => toggleGroup(category)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-semibold text-gray-900 dark:text-white text-sm">{category}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{catItems.length}</span>
                  {isExpanded(category)
                    ? <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                    : <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />}
                </div>
              </button>

              {isExpanded(category) && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {catItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${COND_DOT[item.condition] || 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {item.inBag || 'Unassigned'}
                          {item.qty > 1 && ` · ×${item.qty}`}
                        </div>
                        <PriceLine item={item} />
                      </div>
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {grouped.length === 0 && (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">No items found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          )}
        </div>
      )}

      {/* ── Bags view ── */}
      {view === 'bags' && !loading && (
        <div className="px-4 space-y-2">
          {bags.map((bag) => {
            const count   = bagItemCounts[bag.name] || 0;
            const bagItems = items.filter((i) => i.inBag === bag.name);
            return (
              <div key={bag.id} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center px-4 py-3.5">
                  <button
                    onClick={() => toggleGroup(`bag-${bag.id}`)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <span className="text-xl">{bag.emoji || '🎒'}</span>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">{bag.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bag.owner} · {count} item{count !== 1 ? 's' : ''}</div>
                    </div>
                    <span className="ml-auto mr-2">
                      {isExpanded(`bag-${bag.id}`)
                        ? <ChevronDown size={15} className="text-gray-500 dark:text-gray-400" />
                        : <ChevronRight size={15} className="text-gray-500 dark:text-gray-400" />}
                    </span>
                  </button>
                  <button
                    onClick={() => setSelectedBag(bag)}
                    className="text-xs text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg active:bg-blue-50 dark:active:bg-blue-900/20"
                  >
                    Edit
                  </button>
                </div>

                {isExpanded(`bag-${bag.id}`) && bagItems.length > 0 && (
                  <div className="divide-y divide-gray-50 dark:divide-gray-800 border-t border-gray-50 dark:border-gray-800">
                    {bagItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${COND_DOT[item.condition] || 'bg-gray-300'}`} />
                        <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{item.name}</span>
                        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ''}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {isExpanded(`bag-${bag.id}`) && bagItems.length === 0 && (
                  <p className="px-4 pb-3 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-50 dark:border-gray-800 pt-2">No items in this bag yet.</p>
                )}
              </div>
            );
          })}

          {/* Unassigned */}
          {unassignedCount > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => toggleGroup('bag-unassigned')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-xl">📦</span>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">Unassigned</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{unassignedCount} item{unassignedCount !== 1 ? 's' : ''}</div>
                </div>
                {isExpanded('bag-unassigned')
                  ? <ChevronDown size={15} className="text-gray-500 dark:text-gray-400" />
                  : <ChevronRight size={15} className="text-gray-500 dark:text-gray-400" />}
              </button>
              {isExpanded('bag-unassigned') && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800 border-t border-gray-50 dark:border-gray-800">
                  {items.filter((i) => !i.inBag).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${COND_DOT[item.condition] || 'bg-gray-300'}`} />
                      <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{item.name}</span>
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {bags.length === 0 && unassignedCount === 0 && (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <p className="text-4xl mb-3">🎒</p>
              <p className="font-medium">No bags yet</p>
              <p className="text-sm mt-1">Tap + to add your first bag</p>
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => view === 'items' ? setAddingItem(true) : setAddingBag(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 rounded-full shadow-lg flex items-center justify-center text-white active:bg-blue-700 transition-colors z-10"
      >
        <Plus size={24} />
      </button>

      {/* Modals */}
      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {addingItem   && <ItemModal item={null}         onClose={() => setAddingItem(false)} />}
      {selectedBag  && (
        <BagModal
          bag={selectedBag}
          itemCount={bagItemCounts[selectedBag.name] || 0}
          onClose={() => setSelectedBag(null)}
        />
      )}
      {addingBag && <BagModal bag={null} itemCount={0} onClose={() => setAddingBag(false)} />}
    </div>
  );
}

/** Target price and what was last paid, when either is known. */
function PriceLine({ item }) {
  const target = Number(item.targetPrice);
  const hasTarget = Number.isFinite(target) && target > 0;
  const pctOff = waitPctOff(item.targetPrice, item.waitPrice);
  const paid = lastPurchase(item);
  if (!hasTarget && !paid) return null;

  return (
    <div className="text-xs mt-0.5 flex items-center gap-2 truncate">
      {hasTarget && (
        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
          <Tag size={10} /> {formatUSD(target, { round: true })}
        </span>
      )}
      {pctOff != null && (
        <span className="text-gray-500 dark:text-gray-400">
          wait {formatUSD(item.waitPrice, { round: true })} <span className="opacity-60">−{pctOff}%</span>
        </span>
      )}
      {paid && (
        <span className="text-gray-500 dark:text-gray-400">paid {formatUSD(paid.amountUSD, { round: true })}</span>
      )}
    </div>
  );
}
