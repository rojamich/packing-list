import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from './Sheet';
import { addBag, updateBag, deleteBag } from '../data/store';
import { nameCollision, parentOptions, canHaveParent } from '../lib/bags';
import { useData } from '../context/DataContext';

const EMOJIS = ['🎒', '👝', '📷', '🧳', '💼', '🎽'];

/** The drag gesture already uses this; a save deserves the same acknowledgement. */
const confirmHaptic = () => navigator.vibrate?.(12);

export default function BagModal({ bag, itemCount = 0, onClose }) {
  const isNew = !bag?.id;
  const { bags } = useData();

  const [form, setForm] = useState({
    name:  bag?.name  || '',
    owner: bag?.owner || 'Mike',
    emoji: bag?.emoji || '🎒',
    order: bag?.order ?? 99,
    parentBag: bag?.parentBag || '',
    capacityGrams: bag?.capacityGrams ?? '',
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

  // Items point at bags by name, so a near-duplicate name quietly splits one
  // real bag in two. Warn rather than block: similar names are sometimes
  // deliberate, and the merge tool on the Data page undoes it either way.
  // One level only: a bag already holding sub-bags cannot itself be put inside
  // something. That is how packing actually works, and it makes cycles
  // impossible rather than something to detect and recover from.
  const nestable = canHaveParent(bag || {}, bags);
  const parents = useMemo(() => parentOptions(bag || {}, bags), [bag, bags]);

  const collision = useMemo(
    () => (form.name.trim() ? nameCollision(form.name, bags, bag?.id) : null),
    [form.name, bags, bag?.id],
  );

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const capacity = String(form.capacityGrams).trim();
      const data = {
        ...form,
        name: form.name.trim(),
        parentBag: form.parentBag || null,
        capacityGrams: capacity === '' ? null : Math.max(0, Math.round(Number(capacity) || 0)),
      };
      if (isNew) await addBag(data);
      else       await updateBag(bag.id, bag.name, data);
      confirmHaptic();
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
      confirmHaptic();
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not delete that bag.');
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    const norm = (v) => (v === null || v === undefined ? '' : String(v));
    if (isNew) return !!form.name.trim();
    return ['name', 'owner', 'emoji', 'order', 'parentBag', 'capacityGrams'].some((f) => norm(form[f]) !== norm(bag?.[f]));
  }, [isNew, form, bag]);

  return (
    <Sheet title={isNew ? 'Add Bag' : 'Edit Bag'} onClose={onClose} dirty={dirty} maxHeight="80vh">
        <div className="p-4 space-y-4 pb-8">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {collision && (
            <div className="text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {collision.kind === 'exact'
                  ? 'A bag with this name already exists'
                  : 'This looks like an existing bag'}
              </p>
              <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-300">
                {collision.bag.emoji || '🎒'} {collision.bag.name} — items point at bags by
                name, so two similar names split one real bag in two.
              </p>
            </div>
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

          <Field label="Capacity (g)">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={form.capacityGrams}
              onChange={(e) => setForm((f) => ({ ...f, capacityGrams: e.target.value }))}
              placeholder="Optional"
              className={input}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Use the bag's stated load capacity, if it has one.</p>
          </Field>

          {parents.length > 0 && (
            <Field label="Inside another bag">
              <select
                value={form.parentBag}
                onChange={(e) => setForm((f) => ({ ...f, parentBag: e.target.value }))}
                className={input}
              >
                <option value="">Not inside anything — packed on its own</option>
                {parents.map((b) => (
                  <option key={b.id} value={b.name}>{b.emoji || '🎒'} {b.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                {form.parentBag
                  ? `Shows inside ${form.parentBag} as one line you tick once. What's in here is packed separately.`
                  : 'Pick a bag to put this one inside — a toiletries bag in the Farpoint, say.'}
              </p>
            </Field>
          )}

          {!nestable && !isNew && (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
              This bag holds other bags, so it can't be put inside one itself.
            </p>
          )}

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
              <p className="text-sm text-gray-500 dark:text-gray-400">{itemCount} item{itemCount !== 1 ? 's' : ''} in this bag</p>
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

const input =
  'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500';
