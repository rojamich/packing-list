import { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { addBag, updateBag, deleteBag } from '../data/store';
import { useData } from '../context/DataContext';

const EMOJIS = ['🎒', '👝', '📷', '🧳', '💼', '🎽'];

export default function BagModal({ bag, itemCount = 0, onClose }) {
  const isNew = !bag?.id;
  const { bags } = useData();

  const [form, setForm] = useState({
    name:  bag?.name  || '',
    owner: bag?.owner || 'Mike',
    emoji: bag?.emoji || '🎒',
    order: bag?.order ?? 99,
  });
  const [saving,     setSaving]     = useState(false);
  const [deleteStep, setDeleteStep] = useState(null); // null | 'confirm'
  const [reassignTo, setReassignTo] = useState('');
  const [error,      setError]      = useState(null);

  // Same as ItemModal: don't leave the destructive button armed.
  useEffect(() => {
    if (!deleteStep) return undefined;
    const t = setTimeout(() => setDeleteStep(null), 4000);
    return () => clearTimeout(t);
  }, [deleteStep]);

  const otherBags = bags.filter((b) => b.id !== bag?.id);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = { ...form, name: form.name.trim() };
      if (isNew) await addBag(data);
      else       await updateBag(bag.id, bag.name, data);
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteStep !== 'confirm') { setDeleteStep('confirm'); return; }
    setSaving(true);
    setError(null);
    try {
      await deleteBag(bag.id, bag.name, reassignTo || null);
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not delete that bag.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl max-h-[80vh] overflow-y-auto z-10 shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-gray-900 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white text-lg">
            {isNew ? 'Add Bag' : 'Edit Bag'}
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 pb-8">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Field label="Bag Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Mike's Daypack"
              className={input}
            />
          </Field>

          <Field label="Owner">
            <div className="grid grid-cols-3 gap-2">
              {['Mike', 'Jen', 'Both'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, owner: p }))}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.owner === p
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Icon">
            <div className="flex gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-colors ${
                    form.emoji === e
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          {!isNew && itemCount > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
              <p className="text-sm text-gray-500 dark:text-gray-500 dark:text-gray-400">{itemCount} item{itemCount !== 1 ? 's' : ''} in this bag</p>
            </div>
          )}

          {deleteStep === 'confirm' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle size={14} />
                {itemCount > 0
                  ? `${itemCount} item${itemCount !== 1 ? 's' : ''} will be moved. Pick a destination:`
                  : 'This bag is empty — deleting it affects no items.'}
              </p>
              {itemCount > 0 && (
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className={input}
                >
                  <option value="">Unassigned</option>
                  {otherBags.map((b) => (
                    <option key={b.id} value={b.name}>{b.emoji || '🎒'} {b.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 active:bg-blue-700"
            >
              {saving ? 'Saving…' : isNew ? 'Add Bag' : 'Save Changes'}
            </button>

            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className={`w-full py-3 rounded-xl font-semibold border transition-colors ${
                  deleteStep
                    ? 'bg-red-600 text-white border-red-600'
                    : 'border-red-300 text-red-600 dark:border-red-800 dark:text-red-400'
                }`}
              >
                {deleteStep ? 'Confirm — Delete Bag & Move Items' : 'Delete Bag'}
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
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const input =
  'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500';
