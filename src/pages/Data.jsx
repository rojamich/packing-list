import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Upload, AlertTriangle, Check, FileJson, Table } from 'lucide-react';
import { useData } from '../context/DataContext';
import { applyImportPlan } from '../data/store';
import { APP_VERSION } from '../lib/version';
import {
  buildBackup, itemsToCSV, bagsToCSV, parseImportFile, buildPlan,
  downloadFile, timestampedName,
} from '../lib/transfer';

const MODES = [
  { key: 'update',  label: 'Update only', hint: 'Change items already in the app. Nothing added or deleted.' },
  { key: 'merge',   label: 'Merge',       hint: 'Update existing items and add any new ones. Nothing deleted.' },
  { key: 'replace', label: 'Replace all', hint: 'Merge, then delete every item missing from the file. Bags are never deleted.' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function Data() {
  const { items, bags, settings } = useData();
  const fileInput = useRef(null);

  const [parsed, setParsed]   = useState(null);   // normalised file contents
  const [fileName, setFileName] = useState('');
  const [mode, setMode]       = useState('merge');
  const [error, setError]     = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult]   = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const plan = useMemo(
    () => (parsed ? buildPlan({ incoming: parsed, existingItems: items, existingBags: bags, mode }) : null),
    [parsed, items, bags, mode],
  );

  const needsTypedConfirm = mode === 'replace' && plan?.itemDeletes.length > 0;
  const confirmed = !needsTypedConfirm || confirmText.trim().toUpperCase() === 'DELETE';

  // ── Export ──────────────────────────────────────────────────────
  function exportJSON() {
    const backup = buildBackup({ items, bags, settings, appVersion: APP_VERSION });
    downloadFile(timestampedName('packlist-backup', 'json'), JSON.stringify(backup, null, 2), 'application/json');
  }

  function exportItemsCSV() {
    downloadFile(timestampedName('packlist-items', 'csv'), itemsToCSV(items), 'text/csv');
  }

  function exportBagsCSV() {
    downloadFile(timestampedName('packlist-bags', 'csv'), bagsToCSV(bags), 'text/csv');
  }

  // ── Import ──────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setConfirmText('');
    try {
      const text = await file.text();
      setParsed(parseImportFile(text, file.name));
      setFileName(file.name);
    } catch (err) {
      setParsed(null);
      setFileName('');
      setError(err.message || 'Could not read that file.');
    } finally {
      e.target.value = '';   // let the same file be picked again
    }
  }

  async function handleApply() {
    if (!plan || !confirmed) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyImportPlan(plan);
      setResult({ writes: res.writes, plan });
      setParsed(null);
      setFileName('');
      setConfirmText('');
    } catch (err) {
      setError(err.message || 'The import failed. Nothing may have been written.');
    } finally {
      setApplying(false);
    }
  }

  function cancel() {
    setParsed(null);
    setFileName('');
    setError(null);
    setConfirmText('');
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10 px-4 pt-4 pb-2">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <ArrowLeft size={14} /> Back
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Backup &amp; Bulk Edit</h1>
      </div>

      <div className="px-4 space-y-4 mt-2">
        {/* ── Export ── */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Export</h2>
          </div>

          <ExportButton
            icon={<FileJson size={16} />}
            title="Full backup (JSON)"
            subtitle={`${plural(items.length, 'item')} · ${plural(bags.length, 'bag')} · includes purchase history`}
            onClick={exportJSON}
          />
          <ExportButton
            icon={<Table size={16} />}
            title="Items for spreadsheet (CSV)"
            subtitle="Open in Excel or Sheets to bulk-edit prices, bags and quantities"
            onClick={exportItemsCSV}
          />
          <ExportButton
            icon={<Table size={16} />}
            title="Bags (CSV)"
            subtitle={plural(bags.length, 'bag')}
            onClick={exportBagsCSV}
          />

          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            The CSV keeps only the most recent purchase per item — a spreadsheet can't hold the
            full history. Use the JSON backup if you need everything.
          </p>
        </section>

        {/* ── Import ── */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Import</h2>
          </div>

          {!parsed && (
            <>
              <button
                onClick={() => fileInput.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-6 text-sm font-medium text-gray-500 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800"
              >
                Choose a .json or .csv file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={handleFile}
                className="hidden"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nothing is written until you've reviewed the changes.
              </p>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {parsed && plan && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                <span className="font-medium text-gray-900 dark:text-white">{fileName}</span>
                {' · '}{parsed.items.length} item rows, {parsed.bags.length} bag rows
              </p>

              {/* Mode */}
              <div className="space-y-2">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => { setMode(m.key); setConfirmText(''); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                      mode === m.key
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${mode === m.key ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {m.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.hint}</div>
                  </button>
                ))}
              </div>

              {/* What will happen */}
              <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  This will make {plan.totalWrites} change{plan.totalWrites === 1 ? '' : 's'}
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <Tally label="Items updated"  value={plan.itemUpdates.length} tone="blue" />
                  <Tally label="Items added"    value={plan.itemCreates.length} tone="green" />
                  <Tally label="Items deleted"  value={plan.itemDeletes.length} tone="red" />
                  <Tally label="Bags added"     value={plan.bagCreates.length} tone="green" />
                  <Tally label="Bags updated"   value={plan.bagUpdates.length} tone="blue" />
                  <Tally label="Unchanged"      value={plan.unchangedItems} tone="gray" />
                </div>
              </div>

              {plan.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 flex gap-2">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {w}
                </p>
              ))}

              {plan.skipped.length > 0 && (
                <details className="text-xs">
                  <summary className="text-gray-500 dark:text-gray-400 cursor-pointer">{plan.skipped.length} row(s) skipped</summary>
                  <ul className="mt-1 space-y-0.5 text-gray-500 dark:text-gray-400 pl-4 list-disc">
                    {plan.skipped.slice(0, 15).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </details>
              )}

              {plan.itemUpdates.length > 0 && (
                <details className="text-xs">
                  <summary className="text-blue-600 dark:text-blue-400 cursor-pointer font-medium">
                    Review the {plan.itemUpdates.length} update(s)
                  </summary>
                  <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                    {plan.itemUpdates.map((u) => (
                      <div key={u.id} className="border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-white">{u.before.name}</div>
                        {u.changes.map((c) => (
                          <div key={c.field} className="text-gray-500 dark:text-gray-400 mt-0.5">
                            {c.field}: <span className="line-through">{String(c.from ?? '—')}</span>
                            {' → '}
                            <span className="text-green-600 dark:text-green-400">{String(c.to ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {plan.itemDeletes.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> {plan.itemDeletes.length} item(s) will be permanently deleted
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {plan.itemDeletes.slice(0, 8).map((i) => i.name).join(', ')}
                    {plan.itemDeletes.length > 8 && `, +${plan.itemDeletes.length - 8} more`}
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full border border-red-300 dark:border-red-800 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleApply}
                  disabled={applying || !confirmed || plan.totalWrites === 0}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 active:bg-blue-700"
                >
                  {applying ? 'Importing…' : plan.totalWrites === 0 ? 'Nothing to change' : `Apply ${plan.totalWrites} change${plan.totalWrites === 1 ? '' : 's'}`}
                </button>
                <button
                  onClick={cancel}
                  disabled={applying}
                  className="px-4 py-3 rounded-xl font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5">
                <Check size={14} /> Imported — {result.writes} change{result.writes === 1 ? '' : 's'} written
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                {result.plan.itemUpdates.length} updated · {result.plan.itemCreates.length} added
                {result.plan.itemDeletes.length > 0 && ` · ${result.plan.itemDeletes.length} deleted`}
              </p>
            </div>
          )}
        </section>

        {/* ── How it matches ── */}
        <section className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">💡 Editing in a spreadsheet</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
            Export the items CSV, edit it, then import it back. Rows are matched on the
            hidden <code className="font-mono text-xs">id</code> column — keep it, and you can
            safely rename anything. Delete the id and a row is treated as a brand-new item.
            Fill in <code className="font-mono text-xs">lastPaidUSD</code> and{' '}
            <code className="font-mono text-xs">lastPaidDate</code> to log a purchase; re-importing
            the same file twice won't duplicate it.
          </p>
        </section>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Both of you share one dataset — an import changes what you both see.
        </p>
      </div>
    </div>
  );
}

function ExportButton({ icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-left active:bg-gray-50 dark:active:bg-gray-800"
    >
      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-white">{title}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</span>
      </span>
      <Download size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
    </button>
  );
}

const TONES = {
  blue:  'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  red:   'text-red-600 dark:text-red-400',
  gray:  'text-gray-500 dark:text-gray-400',
};

function Tally({ label, value, tone }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`text-sm font-semibold ${TONES[tone]}`}>{value}</span>
    </div>
  );
}
