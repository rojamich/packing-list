// Build identity, injected by vite.config.js at build time.
// The fallbacks keep `npm run dev` working, where no build has happened.

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const BUILD_ID    = typeof __BUILD_ID__    !== 'undefined' ? __BUILD_ID__    : 'dev';

/** BUILD_ID looks like 20260810T043012 (UTC). Returns a Date, or null in dev. */
export function buildDate(id = BUILD_ID) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

/** "10 Aug 2026, 14:30" in the phone's own timezone — they change often. */
export function formatBuildDate(id = BUILD_ID) {
  const d = buildDate(id);
  if (!d) return 'development build';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const VERSION_LABEL = `v${APP_VERSION} · ${formatBuildDate()}`;
