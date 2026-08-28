import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { addItem, updateItem, deleteItem, logPurchase, removePurchase, setPurchases } from '../data/store';
import { itemQty } from '../lib/packing';
import { DEFAULT_LIFE_MONTHS } from '../lib/dates';
import ItemPricing from './ItemPricing';

const DEFAULT_CATEGORIES = [
  'Clothing – Mike',
  'Clothing – Jen',
  'Electronics',
  'Toiletries – Shared Bag',
  'Health & Medical',
];

export default function ItemModal({ item, onClose }) {
  const isNew = !item?.id;
  const { items, bags } = useData();

  // Categories come from what's actually in the list, so a new one sticks
  // without needing a code change.
  const categories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    items.forEach((i) => { if (i.category) set.add(i.category); });
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
    ...(item || {}),
    targetPrice: item?.targetPrice ?? '',
    waitPrice: item?.waitPrice ?? '',
  }));

  // Purchases logged before a brand-new item exists in Firestore are held here
  // and written once it's created.
  const [pendingPurchases, setPendingPurchases] = useState([]);

  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]                 = useState(null);

  const purchases = isNew ? pendingPurchases : (item.purchases || []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setDirect = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  function buildData() {
    const target = String(form.targetPrice).trim();
    const wait = String(form.waitPrice).trim();
    return {
      name: form.name.trim(),
      category: form.category?.trim() || 'Other',
      person: form.person,
      qty: itemQty(form),
      status: form.status,
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
      await logPurchase(item, entry);
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
      await removePurchase(item, purchaseId);
    } catch (e) {
      setError(e?.message || 'Could not remove that purchase.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl max-h-[92vh] overflow-y-auto z-10 shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 z-10">
          <h2 className="font-semibold text-gray-900 dark:text-white text-lg">
            {isNew ? 'Add Item' : 'Edit Item'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 pb-8">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
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
                  onClick={() => setDirect('status', val)}
                >
                  {label}
                </Choice>
              ))}
            </div>
          </Field>

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
      </div>
    </div>
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
