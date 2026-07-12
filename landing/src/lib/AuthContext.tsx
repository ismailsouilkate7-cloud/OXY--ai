import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthChange, signOutUser, getCurrentUserWithData } from './firebase';

interface AuthState {
  user: any;
  userData: any;
}

interface AuthContextType {
  authState: AuthState | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authState: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AUTH CONTEXT: subscribing to onAuthChange');

    let authResolved = false;
    let authTimer: ReturnType<typeof setTimeout> | null = null;

    const unsub = onAuthChange((state) => {
      if (state) {
        // User confirmed — stop waiting and finalize
        console.log('AUTH CONTEXT: received user:', state.user?.email);
        authResolved = true;
        if (authTimer) clearTimeout(authTimer);
        setAuthState(state);
        setLoading(false);
        return;
      }

      // First null callback: Firebase hasn't restored the session yet — keep waiting
      if (!authResolved) {
        console.log('AUTH CONTEXT: received null — waiting for Firebase to restore session');
        return;
      }

      // Subsequent null callbacks after resolution: user signed out
      console.log('AUTH CONTEXT: user signed out');
      setAuthState(null);
    });

    // Fallback: if auth doesn't resolve within 15s, check auth.currentUser as safety net
    // (handles React StrictMode double-mount where onAuthStateChanged callback is dropped)
    authTimer = setTimeout(async () => {
      if (authResolved) return;

      const fallback = await getCurrentUserWithData();
      if (fallback) {
        console.log('AUTH CONTEXT: fallback resolved user via auth.currentUser:', fallback.user.email);
        authResolved = true;
        setAuthState(fallback);
        setLoading(false);
        return;
      }

      console.log('AUTH CONTEXT: no user after 15s — finalizing as logged out');
      authResolved = true;
      setAuthState(null);
      setLoading(false);
    }, 15000);

    return () => {
      console.log('AUTH CONTEXT: unsubscribing (cleanup)');
      if (authTimer) clearTimeout(authTimer);
      unsub();
    };
  }, []);

  const signOut = async () => {
    await signOutUser();
    setAuthState(null);
  };

  return (
    <AuthContext.Provider value={{ authState, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
