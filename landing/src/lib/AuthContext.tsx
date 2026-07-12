import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthChange, signOutUser } from './firebase';

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
    const unsub = onAuthChange((state) => {
      if (state) {
        console.log('AUTH CONTEXT: received user:', state.user?.email);
      } else {
        console.log('AUTH CONTEXT: received null — setting loading=false');
      }
      setAuthState(state);
      setLoading(false);
    });
    return () => {
      console.log('AUTH CONTEXT: unsubscribing (cleanup)');
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
