import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signUp, signIn, signInWithGooglePopup } from '../lib/firebase';
import { getFriendlyAuthError } from '../lib/authError';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'signup';
  onClose: () => void;
}

export default function AuthModal({ isOpen, initialMode, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<{ label: string; targetMode: 'login' | 'signup' } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorAction(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
      onClose();
    } catch (err: any) {
      const friendlyError = getFriendlyAuthError(err, mode);
      setError(friendlyError.message);
      setErrorAction(friendlyError.action ?? null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setErrorAction(null);
    setLoading(true);
    try {
      await signInWithGooglePopup();
      onClose();
    } catch (err: any) {
      const friendlyError = getFriendlyAuthError(err, mode);
      setError(friendlyError.message);
      setErrorAction(friendlyError.action ?? null);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-surface-secondary border border-border rounded-3xl p-8 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              ✕
            </button>

            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-full border-2 border-primary" />
              <span className="text-lg font-bold tracking-wider">
                <span className="text-primary">VO</span>
                <span className="text-text-primary">SIL</span>
              </span>
            </div>

            <h2 className="text-center text-xl font-semibold mb-6">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!isLogin && (
                <div>
                  <label htmlFor="auth-name" className="block text-sm font-medium text-text-secondary mb-1.5">
                    Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    required={!isLogin}
                    className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Email address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                  <div>{error}</div>
                  {errorAction && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode(errorAction.targetMode);
                        setError('');
                        setErrorAction(null);
                      }}
                      className="mt-2 font-medium text-primary hover:text-primary-hover transition-colors"
                    >
                      {errorAction.label}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Continue'
                )}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 text-xs text-text-muted bg-surface-secondary">
                  OR
                </span>
              </div>
            </div>

            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full py-3 text-sm font-medium text-text-primary bg-white rounded-xl hover:bg-gray-100 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-sm text-text-muted mt-6">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(isLogin ? 'signup' : 'login');
                  setError('');
                  setErrorAction(null);
                }}
                className="text-primary hover:text-primary-hover font-medium transition-colors"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
