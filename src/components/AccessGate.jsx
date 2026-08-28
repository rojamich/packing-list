import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { ShieldAlert, WifiOff, X } from 'lucide-react';
import { auth } from '../firebase';
import { useData } from '../context/DataContext';

/**
 * Firebase Auth will happily sign in any Google account — the Firestore rules
 * are what decide who can read the data. Without this, an account that isn't on
 * the allowlist signs in successfully and then sees a completely empty app,
 * which reads as "the data is gone" rather than "you don't have access".
 *
 * Only a rules rejection takes over the screen. Every other failure leaves the
 * app usable behind a dismissible banner — Firestore serves from cache and
 * retries on its own, so blocking the whole UI on a transient error (and never
 * clearing it) just turned a blip into a forced reload.
 */
export default function AccessGate({ user, children }) {
  const { accessDenied, error } = useData();
  const [dismissed, setDismissed] = useState(false);

  // Once it recovers, a later problem should be able to speak up again.
  useEffect(() => { if (!error) setDismissed(false); }, [error]);

  if (accessDenied) return <NoAccessScreen user={user} />;

  return (
    <>
      {error && !dismissed && (
        <ConnectionBanner
          message={error.message}
          onDismiss={() => setDismissed(true)}
        />
      )}
      {children}
    </>
  );
}

function ConnectionBanner({ message, onDismiss }) {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 shadow-md"
    >
      <WifiOff size={16} className="flex-shrink-0" />
      <span className="flex-1 text-sm font-medium">
        Trouble syncing — showing the last data on this device.
        {message ? <span className="font-normal opacity-90"> {message}</span> : null}
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 p-1 -mr-1 rounded active:bg-amber-600"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function NoAccessScreen({ user }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg max-w-sm w-full text-center">
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-amber-100 dark:bg-amber-900/30">
          <ShieldAlert size={22} className="text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          This account doesn’t have access
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Signed in as
        </p>
        <p className="text-sm font-medium text-gray-900 dark:text-white break-all mb-4">
          {user?.email || 'unknown account'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
          The data is shared, not per-account — this address just isn’t on the allowlist in
          the Firestore security rules yet. Add it to <code className="font-mono text-xs">firestore.rules</code>{' '}
          and redeploy, then sign in again.
        </p>

        <div className="space-y-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm active:bg-blue-700"
          >
            Try again
          </button>
          <button
            onClick={() => signOut(auth)}
            className="w-full py-2.5 rounded-xl font-medium text-sm text-gray-500 border border-gray-200 dark:border-gray-700"
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}
