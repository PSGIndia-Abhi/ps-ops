import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authApi, ApiError, setUnauthorizedHandler } from '../api';
import { clearSession, loadSession, saveSession } from './tokenStorage';
import type { AuthSession, CurrentUser } from '../types/auth';

type AuthStatus = 'bootstrapping' | 'signedOut' | 'signingIn' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  session: AuthSession | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Avoids forcing a second logout if the interceptor fires while a manual
  // logout is already in flight.
  const loggingOutRef = useRef(false);

  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      await clearSession();
    } finally {
      setUser(null);
      setSession(null);
      setStatus('signedOut');
      loggingOutRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Any request that comes back 401 (expired/invalid token) drops the
    // session and returns the user to Login - handled in one place instead
    // of every screen checking for it.
    setUnauthorizedHandler(() => {
      logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (!stored) {
        setStatus('signedOut');
        return;
      }

      setSession(stored);
      try {
        const me = await authApi.fetchCurrentUser();
        setUser(me);
        setStatus('signedIn');
      } catch {
        // Token expired/invalid since last launch.
        await clearSession();
        setSession(null);
        setStatus('signedOut');
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setStatus('signingIn');
    setError(null);
    try {
      const response = await authApi.login(email.trim(), password);
      const newSession: AuthSession = {
        token: response.token,
        role: response.role,
        userId: response.user_id != null ? String(response.user_id) : undefined,
        contactId: response.contact_id != null ? String(response.contact_id) : undefined,
      };

      await saveSession(newSession);
      setSession(newSession);

      const me = await authApi.fetchCurrentUser();
      setUser(me);
      setStatus('signedIn');
    } catch (err) {
      setStatus('signedOut');
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ status, user, session, error, login, logout, clearError }),
    [status, user, session, error, login, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
