import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { useData } from '../context/DataContext';
import { bulkUpdateItems } from '../data/store';
import { categoryNames } from '../lib/categories';

export default function BulkEditSheet({ ids, onClose }) {
  const { items, bags, categories } = useData();
  const names = useMemo(() => categoryNames(categories, items), [categories, items]);
  const [form, setForm] = useState({ category: '', person: '', status: '', inBag: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((previous) => ({ ...previous, [key]: e.target.value }));

  async function save() {
    const changes = {};
    Object.entries(form).forEach(([key, value]) => {
      if (!value) return;
      changes[key] = key === 'inBag' && value === '__unassigned__' ? null : value;
    });
    if (!Object.keys(changes).length) { onClose(); return; }
    setSaving(true); setError(null);
    try { await bulkUpdateItems(ids, changes); onClose(); }
    catch (e) { setError(e?.message || 'Could not update the selected items.'); setSaving(false); }
  }

  return (
    <Sheet title={`Edit ${ids.length} Items`} onClose={onClose} maxHeight="80vh">
      <div className="p-4 space-y-4 pb-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">Leave a field unchanged to keep each item's current value.</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Field label="Category"><select value={form.category} onChange={set('category')} className={input}><option value="">No change</option>{names.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
        <Field label="Owner"><select value={form.person} onChange={set('person')} className={input}><option value="">No change</option>{['Mike', 'Jen', 'Both'].map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Status"><select value={form.status} onChange={set('status')} className={input}><option value="">No change</option><option value="have">Have It</option><option value="buy">Buy</option><option value="replace">Replace</option></select></Field>
        <Field label="Bag"><select value={form.inBag} onChange={set('inBag')} className={input}><option value="">No change</option><option value="__unassigned__">Unassigned</option>{bags.map((bag) => <option key={bag.id} value={bag.name}>{bag.name}</option>)}</select></Field>
        <button disabled={saving} onClick={save} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Apply Changes'}</button>
      </div>
    </Sheet>
  );
}

function Field({ label, children }) { return <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 space-y-1"><span>{label}</span>{children}</label>; }
const input = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500';
