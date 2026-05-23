import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthSession } from '@ncaa/domain';
import { clearSession, listDemoUsers, loadSession, signInAsUserId } from '@ncaa/auth';
import { signIn as apiSignIn } from './api';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  signIn: (userId: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      const cached = loadSession();
      if (!cached) {
        setLoading(false);
        return;
      }

      setSession(cached);
      setLoading(false);
    }

    void restoreSession();
  }, []);

  const signIn = useCallback(async (userId: string, password: string) => {
    const next = await apiSignIn(userId, password);
    signInAsUserId(userId);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { listDemoUsers };
