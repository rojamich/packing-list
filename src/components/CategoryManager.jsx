import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { useData } from '../context/DataContext';
import { addCategory, updateCategory, deleteCategory } from '../data/store';
import { categoryNames } from '../lib/categories';

export default function CategoryManager({ onClose }) {
  const { categories, items } = useData();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [replacement, setReplacement] = useState('Other');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const records = useMemo(() => {
    const saved = new Map(categories.map((category) => [category.name, category]));
    return categoryNames(categories, items).map((name) => ({
      id: saved.get(name)?.id ?? null,
      name,
      count: items.filter((item) => item.category === name).length,
    }));
  }, [categories, items]);

  async function run(work) {
    setSaving(true);
    setError(null);
    try { await work(); }
    catch (e) { setError(e?.message || 'Could not save that category.'); }
    finally { setSaving(false); }
  }

  return (
    <Sheet title="Manage Categories" onClose={onClose} maxHeight="80vh">
      <div className="p-4 space-y-3 pb-8">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category" className={input} />
          <button disabled={saving || !newName.trim()} onClick={() => run(async () => { await addCategory(newName); setNewName(''); })} className="px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Add</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Renaming or removing a category updates every item using it.</p>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
          {records.map((record) => (
            <div key={record.name} className="p-3">
              {editing?.name === record.name ? (
                <div className="flex gap-2">
                  <input autoFocus value={editing.value} onChange={(e) => setEditing((v) => ({ ...v, value: e.target.value }))} className={input} />
                  <button disabled={saving || !editing.value.trim()} onClick={() => run(async () => { await updateCategory(record.id, record.name, editing.value); setEditing(null); })} className="text-sm font-semibold text-blue-600 dark:text-blue-400">Save</button>
                </div>
              ) : removing?.name === record.name ? (
                <div className="space-y-2">
                  <p className="text-sm text-amber-700 dark:text-amber-300">Move {record.count} item{record.count === 1 ? '' : 's'} to:</p>
                  <div className="flex gap-2">
                    <select value={replacement} onChange={(e) => setReplacement(e.target.value)} className={input}>
                      {records.filter((r) => r.name !== record.name).map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                      <option value="Other">Other</option>
                    </select>
                    <button disabled={saving} onClick={() => run(async () => { await deleteCategory(record.id, record.name, replacement); setRemoving(null); })} className="text-sm font-semibold text-red-600 dark:text-red-400">Remove</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white truncate">{record.name}</p><p className="text-xs text-gray-500">{record.count} item{record.count === 1 ? '' : 's'}</p></div>
                  <button onClick={() => setEditing({ name: record.name, value: record.name })} className="text-xs text-blue-600 dark:text-blue-400">Rename</button>
                  <button onClick={() => { setReplacement('Other'); setRemoving(record); }} className="text-xs text-red-600 dark:text-red-400">Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

const input = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
