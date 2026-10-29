import { useState } from 'react';
import Sheet from './Sheet';
import { useData } from '../context/DataContext';
import { addProfile, deleteProfile } from '../data/store';

export default function ProfileSheet({ itemIds = [], onClose }) {
  const { profiles, items } = useData();
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    if (!name.trim() || !itemIds.length) return;
    setSaving(true); setError(null);
    try {
      const selected = new Set(itemIds);
      await addProfile({
        name,
        itemIds,
        itemKeys: items.filter((item) => selected.has(item.id)).map((item) => ({ name: item.name, person: item.person || 'Both' })),
      });
      onClose();
    }
    catch (e) { setError(e?.message || 'Could not save this profile.'); setSaving(false); }
  }
  return (
    <Sheet title={itemIds.length ? 'Save Packing Profile' : 'Packing Profiles'} onClose={onClose} maxHeight="80vh">
      <div className="p-4 space-y-4 pb-8">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {itemIds.length > 0 && <><p className="text-sm text-gray-500 dark:text-gray-400">This profile will include {itemIds.length} selected item{itemIds.length === 1 ? '' : 's'}.</p><div className="flex gap-2"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beach weekend" className={input} /><button disabled={saving || !name.trim()} onClick={save} className="px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Save</button></div></>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
          {profiles.map((profile) => <div key={profile.id} className="flex items-center gap-3 p-3"><div className="flex-1"><p className="text-sm font-medium text-gray-900 dark:text-white">{profile.name}</p><p className="text-xs text-gray-500">{profile.itemIds?.length || 0} items</p></div><button onClick={() => removing === profile.id ? deleteProfile(profile.id).catch((e) => setError(e?.message || 'Could not remove profile.')) : setRemoving(profile.id)} className={`text-xs ${removing === profile.id ? 'font-semibold text-red-600' : 'text-red-600 dark:text-red-400'}`}>{removing === profile.id ? 'Confirm remove' : 'Remove'}</button></div>)}
          {!profiles.length && <p className="p-3 text-sm text-gray-500">No saved profiles yet.</p>}
        </div>
      </div>
    </Sheet>
  );
}

const input = 'flex-1 min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
