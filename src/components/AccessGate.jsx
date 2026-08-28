import { signOut } from 'firebase/auth';
import { ShieldAlert, WifiOff } from 'lucide-react';
import { auth } from '../firebase';
import { useData } from '../context/DataContext';

/**
 * Firebase Auth will happily sign in any Google account — the Firestore rules
 * are what decide who can read the data. Without this, an account that isn't on
 * the allowlist signs in successfully and then sees a completely empty app,
 * which reads as "the data is gone" rather than "you don't have access".
 */
export default function AccessGate({ user, children }) {
  const { error } = useData();

  if (!error) return children;

  const denied = error.code === 'permission-denied' || error.code === 'unauthenticated';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg max-w-sm w-full text-center">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
          denied ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-800'
        }`}>
          {denied
            ? <ShieldAlert size={22} className="text-amber-600 dark:text-amber-400" />
            : <WifiOff size={22} className="text-gray-500" />}
        </div>

        {denied ? (
          <>
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
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Couldn’t reach your data
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
              {error.message || 'Check your connection and try again.'}
            </p>
          </>
        )}

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
