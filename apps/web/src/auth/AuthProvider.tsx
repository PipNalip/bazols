import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  loadSession,
  login as loginRequest,
  logout as logoutRequest,
  type AuthSession,
  type AuthUser,
} from './api.js';

type AuthContextValue =
  | {
      status: 'loading'; user: null; csrfToken: null; sessionExpired: boolean; login: Login; logout: Logout;
    }
  | {
      status: 'anonymous'; user: null; csrfToken: null; sessionExpired: boolean; login: Login; logout: Logout;
    }
  | {
      status: 'authenticated';
      user: AuthUser;
      csrfToken: string;
      sessionExpired: boolean;
      login: Login;
      logout: Logout;
    };

type Login = (username: string, password: string) => Promise<void>;
type Logout = () => Promise<void>;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'authenticated'>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clear = useCallback((expired = false) => {
    setSession(null);
    setSessionExpired(expired);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    let active = true;
    void loadSession()
      .then((current) => {
        if (!active) return;
        setSession(current);
        setSessionExpired(false);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status !== 401) {
          // A bootstrap transport failure is shown as an anonymous state so the user can retry login.
        }
        clear();
      });
    const expired = () => clear(true);
    window.addEventListener('bazols:unauthorized', expired);
    return () => {
      active = false;
      window.removeEventListener('bazols:unauthorized', expired);
    };
  }, [clear]);

  const login = useCallback<Login>(async (username, password) => {
    const current = await loginRequest(username, password);
    setSession(current);
    setSessionExpired(false);
    setStatus('authenticated');
  }, []);

  const logout = useCallback<Logout>(async () => {
    if (session) {
      try {
        await logoutRequest(session.csrfToken);
      } finally {
        clear(false);
      }
    } else {
      clear(false);
    }
  }, [clear, session]);

  const value = useMemo<AuthContextValue>(() => {
    if (status === 'authenticated' && session) {
      return { status, user: session.user, csrfToken: session.csrfToken, sessionExpired, login, logout };
    }
    if (status === 'loading') {
      return { status, user: null, csrfToken: null, sessionExpired, login, logout };
    }
    return { status: 'anonymous', user: null, csrfToken: null, sessionExpired, login, logout };
  }, [status, session, sessionExpired, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}
