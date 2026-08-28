import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BUILD_ID } from '../lib/version';

// Asks the server which build is live and compares it against the one running.
// This is the answer to "am I actually looking at the latest version?" —
// version.json is rewritten by every build and served with no-cache.
//
// Lives in a context so the banner and the Dashboard footer share one poller.

const POLL_MS = 15 * 60 * 1000;
// Phones fire visibilitychange on every app switch; without a floor that
// bypasses POLL_MS entirely and bills a request each time.
const MIN_GAP_MS = 5 * 60 * 1000;

const UpdateContext = createContext(null);

export function UpdateProvider({ children }) {
  const [latest, setLatest]       = useState(null);
  const [checking, setChecking]   = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckAt = useRef(0);

  const check = useCallback(async () => {
    // Nothing to compare against until a real build exists.
    if (BUILD_ID === 'dev') return null;
    setChecking(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      setLatest(json);
      lastCheckAt.current = Date.now();
      setLastCheck(lastCheckAt.current);
      return json;
    } catch {
      return null;   // offline is normal for this app; stay quiet
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();

    // Phones suspend background tabs, so re-check on return to the foreground.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckAt.current < MIN_GAP_MS) return;
      check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, POLL_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [check]);

  /** Drop the old worker and every cache, then reload onto the new build. */
  const applyUpdate = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.waiting?.postMessage('SKIP_WAITING');
        await reg?.update().catch(() => {});
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  }, []);

  const updateAvailable = !!latest && latest.buildId !== BUILD_ID;

  const value = useMemo(() => ({
    updateAvailable,
    showBanner: updateAvailable && !dismissed,
    dismiss: () => setDismissed(true),
    latest,
    checking,
    lastCheck,
    check,
    applyUpdate,
  }), [updateAvailable, dismissed, latest, checking, lastCheck, check, applyUpdate]);

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdate must be used inside <UpdateProvider>');
  return ctx;
}
