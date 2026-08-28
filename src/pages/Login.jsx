import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { VERSION_LABEL } from '../lib/version';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Sign in failed. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🎒</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Mike & Jen</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">Nomad Pack List · 2026–2028</p>

        {error && (
          <p className="text-red-500 text-sm mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 px-4 text-gray-700 dark:text-white font-medium shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition active:scale-95"
        >
          <GoogleIcon />
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          Private app — only accessible to authorized accounts.
        </p>
        <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-600">{VERSION_LABEL}</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
