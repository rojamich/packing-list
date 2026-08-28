import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

// Persist the cache to IndexedDB rather than memory. Everything else here is
// built offline-first — the service worker, the bundled fallback rates — but
// the default memory cache doesn't survive a reload, so a cold start with no
// signal showed an empty gear list. The multi-tab manager keeps two open tabs
// from fighting over the same IndexedDB lease.
//
// If IndexedDB is unavailable (private browsing, storage disabled) the SDK
// logs a warning and falls back to the in-memory cache on its own, so this is
// safe to call unconditionally.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
