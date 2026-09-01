'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import toast from 'react-hot-toast';

import api from '@/lib/api';

export type AuthUser = {
  id: number;
  username: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function setAuthCookie(token: string) {
  // Routing convenience only — backend validates Authorization header.
  document.cookie = `token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

function clearAuthCookie() {
  document.cookie = 'token=; path=/; Max-Age=0; SameSite=Lax';
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearAuthCookie();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      setAuthCookie(storedToken);

      try {
        const { data } = await api.get<AuthUser>('/users/me/');
        if (cancelled) {
          return;
        }
        setToken(storedToken);
        setUser(data);
        localStorage.setItem(USER_KEY, JSON.stringify(data));
      } catch {
        if (!cancelled) {
          clearStoredSession();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setAuthCookie(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data } = await api.post<{ token: string; user: AuthUser }>(
        '/users/login/',
        { username, password },
      );
      persistSession(data.token, data.user);
      toast.success(`Welcome back, ${data.user.username}!`);
    },
    [persistSession],
  );

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      confirmPassword: string,
    ) => {
      const { data } = await api.post<{ token: string; user: AuthUser }>(
        '/users/register/',
        {
          username,
          email,
          password,
          confirm_password: confirmPassword,
        },
      );
      persistSession(data.token, data.user);
      toast.success(`Account created. Welcome, ${data.user.username}!`);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/users/logout/');
    } catch {
      // Always clear local session even if revocation fails.
    } finally {
      clearStoredSession();
      setToken(null);
      setUser(null);
      toast.success('Logged out successfully.');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
