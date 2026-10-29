import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { replaceState, replaceFields } from '../lib/replace';
import Sheet from './Sheet';
import { useData } from '../context/DataContext';
import { addItem, updateItem, deleteItem, logPurchase, removePurchase, setPurchases } from '../data/store';
import { itemQty } from '../lib/packing';
import { DEFAULT_LIFE_MONTHS } from '../lib/dates';
import { canonicalCategory } from '../lib/categories';
import ItemPricing from './ItemPricing';

// The fields this form actually writes. Used to spot a concurrent edit without
// tripping over `updatedAt`, which our own purchase writes bump too.
const EDITABLE = [
  'name', 'category', 'person', 'qty', 'status', 'inBag',
  'condition', 'estLifeMonths', 'targetPrice', 'waitPrice', 'notes', 'replaceQty',
];

const pickEditable = (it) =>
  Object.fromEntries(EDITABLE.map((f) => [f, it?.[f] ?? null]));

const DEFAULT_CATEGORIES = [
  'Clothing – Mike',
  'Clothing – Jen',
  'Electronics',
  'Hygiene',
  'Health & Medical',
];

/** The drag gesture already uses this; a save deserves the same acknowledgement. */
const confirmHaptic = () => navigator.vibrate?.(12);

export default function ItemModal({ item, onClose }) {
  const isNew = !item?.id;
  const { items, bags } = useData();

  // The pages hold the tapped row in state, so `item` is a snapshot frozen at
  // tap time — it never sees later Firestore updates. Anything that reads or
  // appends to server data has to go through `live` instead, or a second write
  // is computed from a stale list and silently overwrites the first.
  const live = useMemo(
    () => (isNew ? null : items.find((i) => i.id === item.id) ?? item),
    [isNew, items, item],
  );

  // Categories come from what's actually in the list, so a new one sticks
  // without needing a code change.
  const categories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    items.forEach((i) => { if (i.category) set.add(canonicalCategory(i.category)); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const [form, setForm] = useState(() => ({
    name: '',
    category: DEFAULT_CATEGORIES[0],
    person: 'Mike',
    qty: 1,
    status: 'have',
    inBag: '',
    condition: 'good',
    estLifeMonths: DEFAULT_LIFE_MONTHS,
    notes: '',
    ...(item ? { ...item, category: canonicalCategory(item.category) } : {}),
    targetPrice: item?.targetPrice ?? '',
    waitPrice: item?.waitPrice ?? '',
    replaceQty: replaceState(item || {}).replaceQty,
  }));

  // Purchases logged before a brand-new item exists in Firestore are held here
  // and written once it's created.
  const [pendingPurchases, setPendingPurchases] = useState([]);

  // What the form was seeded with. If `live` has drifted from this, the other
  // phone edited the same item while this sheet was open — saving would silently
  // overwrite their change.
  const [baseline] = useState(() => (item?.id ? pickEditable(item) : null));

  const remoteEdits = useMemo(() => {
    if (isNew || !baseline || !live) return [];
    const now = pickEditable(live);
    return EDITABLE.filter(
      (f) => String(baseline[f] ?? '') !== String(now[f] ?? ''),
    );
  }, [isNew, baseline, live]);

  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Disarm on its own. Left primed, the confirm state sits directly beneath
  // Save for the rest of the session.
  useEffect(() => {
    if (!confirmDelete) return undefined;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);
  const [error, setError]                 = useState(null);

  const purchases = isNew ? pendingPurchases : (live?.purchases || []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setDirect = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const qtyNum = itemQty(form);
  const replaceCount = Math.max(0, Math.min(qtyNum, Number(form.replaceQty) || 0));

  // Status and the per-unit count are two views of the same fact, so moving
  // either one moves the other rather than letting them drift apart.
  const setReplaceCount = (n) => {
    const next = Math.max(0, Math.min(qtyNum, n));
    setForm((f) => ({
      ...f,
      replaceQty: next,
      status: f.status === 'buy' ? 'buy' : (next === qtyNum && qtyNum > 0 ? 'replace' : 'have'),
    }));
  };

  const setStatus = (val) => setForm((f) => ({
    ...f,
    status: val,
    replaceQty: val === 'replace' ? qtyNum : val === 'have' ? 0 : f.replaceQty,
  }));

  function buildData() {
    const target = String(form.targetPrice).trim();
    const wait = String(form.waitPrice).trim();
    return {
      name: form.name.trim(),
      category: form.category?.trim() || 'Other',
      person: form.person,
      qty: itemQty(form),
      status: form.status,
      ...replaceFields({ qty: itemQty(form), status: form.status }, form.replaceQty),
      inBag: form.inBag || null,
      condition: form.condition,
      estLifeMonths: Number(form.estLifeMonths) || DEFAULT_LIFE_MONTHS,
      notes: form.notes || '',
      targetPrice: target === '' ? null : Number(target),
      waitPrice: wait === '' ? null : Number(wait),
    };
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const ref = await addItem(buildData());
        if (pendingPurchases.length) await setPurchases(ref.id, pendingPurchases);
      } else {
        await updateItem(item.id, buildData());
      }
      confirmHaptic();
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    setError(null);
    try {
      await deleteItem(item.id);
      confirmHaptic();
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not delete.');
      setSaving(false);
    }
  }

  async function handleLogPurchase(entry) {
    if (isNew) {
      setPendingPurchases((p) => [...p, { ...entry, id: `pending-${Date.now()}` }]);
      return;
    }
    try {
      await logPurchase(live, entry);
    } catch (e) {
      setError(e?.message || 'Could not log that purchase.');
    }
  }

  async function handleRemovePurchase(purchaseId) {
    if (isNew) {
      setPendingPurchases((p) => p.filter((x) => x.id !== purchaseId));
      return;
    }
    try {
      await removePurchase(live, purchaseId);
    } catch (e) {
      setError(e?.message || 'Could not remove that purchase.');
    }
  }

  // Guards the backdrop: a stray tap on the dark area used to discard
  // everything typed into the sheet, with no warning.
  const dirty = useMemo(() => {
    const norm = (v) => (v === null || v === undefined ? '' : String(v));
    if (isNew) return !!form.name.trim() || pendingPurchases.length > 0;
    return EDITABLE.some((f) => norm(form[f]) !== norm(live?.[f]));
  }, [isNew, form, pendingPurchases, live]);

  return (
    <Sheet title={isNew ? 'Add Item' : 'Edit Item'} onClose={onClose} dirty={dirty}>
        <div className="p-4 space-y-4 pb-8">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {remoteEdits.length > 0 && (
            <div className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <p className="font-medium">Someone else changed this item</p>
              <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-300">
                {remoteEdits.join(', ')} {remoteEdits.length === 1 ? 'was' : 'were'} updated
                on the other device. Saving will replace {remoteEdits.length === 1 ? 'it' : 'them'} with
                what's on this screen.
              </p>
            </div>
          )}

          <Field label="Item Name">
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Merino t-shirt"
              className={input}
            />
          </Field>

          <Field label="Category">
            <input
              type="text"
              list="item-categories"
              value={form.category}
              onChange={set('category')}
              placeholder="Pick one or type a new one"
              className={input}
            />
            <datalist id="item-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>

          <Field label="Owner">
            <div className="grid grid-cols-3 gap-2">
              {['Mike', 'Jen', 'Both'].map((p) => (
                <Choice key={p} active={form.person === p} onClick={() => setDirect('person', p)}>
                  {p}
                </Choice>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty">
              <input type="number" inputMode="numeric" min="1" value={form.qty} onChange={set('qty')} className={input} />
            </Field>
            <Field label="Est. Life (mo)">
              <input type="number" inputMode="numeric" min="1" value={form.estLifeMonths} onChange={set('estLifeMonths')} className={input} />
            </Field>
          </div>

          <Field label="Status">
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'have', label: 'Have It', cls: 'bg-green-600 border-green-600' },
                { val: 'buy', label: 'Buy', cls: 'bg-amber-500 border-amber-500' },
                { val: 'replace', label: 'Replace', cls: 'bg-red-500 border-red-500' },
              ].map(({ val, label, cls }) => (
                <Choice
                  key={val}
                  active={form.status === val}
                  activeClass={`${cls} text-white`}
                  onClick={() => setStatus(val)}
                >
                  {label}
                </Choice>
              ))}
            </div>
          </Field>

          {qtyNum > 1 && form.status !== 'buy' && (
            <Field label="How many need replacing?">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Fewer need replacing"
                  disabled={replaceCount === 0}
                  onClick={() => setReplaceCount(replaceCount - 1)}
                  className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-800"
                >
                  <Minus size={16} />
                </button>
                <span className={`text-sm font-semibold tabular-nums w-16 text-center ${
                  replaceCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {replaceCount} of {qtyNum}
                </span>
                <button
                  type="button"
                  aria-label="More need replacing"
                  disabled={replaceCount >= qtyNum}
                  onClick={() => setReplaceCount(replaceCount + 1)}
                  className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-800"
                >
                  <Plus size={16} />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                  {replaceCount === 0
                    ? 'All of them are fine.'
                    : replaceCount === qtyNum
                      ? 'The whole set is worn out.'
                      : `${qtyNum - replaceCount} still good, ${replaceCount} to replace.`}
                </span>
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="In Bag">
              <select value={form.inBag || ''} onChange={set('inBag')} className={input}>
                <option value="">Unassigned</option>
                {bags.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={set('condition')} className={input}>
                {['new', 'good', 'fair', 'poor'].map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <ItemPricing
              targetPrice={form.targetPrice}
              onTargetPriceChange={(v) => setDirect('targetPrice', v)}
              waitPrice={form.waitPrice}
              onWaitPriceChange={(v) => setDirect('waitPrice', v)}
              purchases={purchases}
              onLogPurchase={handleLogPurchase}
              onRemovePurchase={handleRemovePurchase}
              disabled={saving}
            />
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes || ''}
              onChange={set('notes')}
              rows={3}
              placeholder="Any notes..."
              className={`${input} resize-none`}
            />
          </Field>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-base disabled:opacity-50 active:bg-blue-700"
            >
              {saving ? 'Saving…' : isNew ? 'Add Item' : 'Save Changes'}
            </button>

            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className={`w-full py-3 rounded-xl font-semibold border transition-colors ${
                  confirmDelete
                    ? 'bg-red-600 text-white border-red-600'
                    : 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
                }`}
              >
                {confirmDelete ? 'Tap again to confirm delete' : 'Delete Item'}
              </button>
            )}
          </div>
        </div>
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Choice({ active, activeClass = 'bg-blue-600 text-white border-blue-600', onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
        active ? activeClass : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

const input =
  'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500';
