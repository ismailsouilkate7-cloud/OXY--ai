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
    const unsub = onAuthChange((state) => {
      setAuthState(state);
      setLoading(false);
    });
    return unsub;
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
