import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { updateSettings } from '../data/store';
import { fetchRates, FALLBACK_RATES, RATES_MAX_AGE_MS, BASE_CURRENCY } from '../lib/money';

// One subscription per collection for the whole app. Previously every page and
// every modal opened its own listener, so a single item edit could have five
// live queries running against the same data.

const DataContext = createContext(null);

const byOrderThenName = (a, b) => {
  const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return String(a.name || '').localeCompare(String(b.name || ''));
};

export function DataProvider({ children }) {
  const [items, setItems]       = useState([]);
  const [bags, setBags]         = useState([]);
  const [settings, setSettings] = useState(null);

  const [itemsLoading, setItemsLoading]       = useState(true);
  const [bagsLoading, setBagsLoading]         = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Errors are tracked per listener and cleared when that listener recovers.
  // Previously one shared `error` was set and never unset, so a single blip on
  // any collection blanked the whole app until a manual reload.
  const [errors, setErrors] = useState({ items: null, bags: null, settings: null });

  const failed  = useCallback((src) => (e) => setErrors((p) => ({ ...p, [src]: e })), []);
  // Only touch state when there is something to clear, so a healthy snapshot
  // doesn't trigger a re-render on every update.
  const healthy = useCallback((src) => setErrors((p) => (p[src] ? { ...p, [src]: null } : p)), []);

  useEffect(() => {
    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrderThenName));
        setItemsLoading(false);
        healthy('items');
      },
      (e) => { failed('items')(e); setItemsLoading(false); },
    );

    const unsubBags = onSnapshot(
      collection(db, 'bags'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) ||
                            String(a.name || '').localeCompare(String(b.name || '')));
        setBags(data);
        setBagsLoading(false);
        healthy('bags');
      },
      (e) => { failed('bags')(e); setBagsLoading(false); },
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        setSettings(snap.exists() ? snap.data() : {});
        setSettingsLoading(false);
        healthy('settings');
      },
      (e) => { failed('settings')(e); setSettingsLoading(false); },
    );

    return () => { unsubItems(); unsubBags(); unsubSettings(); };
  }, [failed, healthy]);

  // A rules rejection means there is genuinely nothing to show — that one still
  // takes over the screen. Anything else leaves the app usable.
  const accessDenied = Object.values(errors).some(
    (e) => e?.code === 'permission-denied' || e?.code === 'unauthenticated',
  );

  // `settings` only carries exchange rates and a currency preference, so it must
  // never gate the gear list.
  const error = errors.items || errors.bags || null;

  // ── Exchange rates ──────────────────────────────────────────────
  // Refreshed at most once a day and written back to Firestore, so both phones
  // share the same rates and an offline phone still has yesterday's numbers.
  const refreshing = useRef(false);

  const refreshRates = useCallback(async ({ force = false } = {}) => {
    if (refreshing.current) return false;
    const age = Date.now() - (settings?.ratesUpdatedAt || 0);
    if (!force && settings?.rates && age < RATES_MAX_AGE_MS) return false;

    refreshing.current = true;
    try {
      const rates = await fetchRates();
      if (!rates) return false;
      await updateSettings({ rates, ratesUpdatedAt: Date.now(), ratesSource: 'live' });
      return true;
    } catch {
      return false;
    } finally {
      refreshing.current = false;
    }
  }, [settings?.rates, settings?.ratesUpdatedAt]);

  useEffect(() => {
    if (settingsLoading) return;
    refreshRates();
  }, [settingsLoading, refreshRates]);

  const rates = settings?.rates && Object.keys(settings.rates).length > 1
    ? settings.rates
    : FALLBACK_RATES;

  const ratesAreLive = !!(settings?.rates && settings?.ratesUpdatedAt);

  const activeCurrency = settings?.activeCurrency || BASE_CURRENCY;
  const setActiveCurrency = useCallback((code) => updateSettings({ activeCurrency: code }), []);

  const value = useMemo(() => ({
    items,
    bags,
    settings: settings || {},
    loading: itemsLoading || bagsLoading,
    settingsLoading,
    error,
    errors,
    accessDenied,
    rates,
    ratesAreLive,
    ratesUpdatedAt: settings?.ratesUpdatedAt || null,
    refreshRates,
    activeCurrency,
    setActiveCurrency,
  }), [items, bags, settings, itemsLoading, bagsLoading, settingsLoading, error,
       errors, accessDenied, rates, ratesAreLive, refreshRates, activeCurrency,
       setActiveCurrency]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
