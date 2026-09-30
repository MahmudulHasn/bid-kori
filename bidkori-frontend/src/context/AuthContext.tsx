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
import {
  AUTH_EXPIRED_EVENT,
  TOKEN_KEY,
  USER_KEY,
  buildRegisterPayload,
} from '@/lib/authRouting';
import {
  clearClientAuthStorage,
  setSessionHintCookie,
} from '@/lib/authStorage';
import { authenticateWithGoogle, buildGoogleAuthPayload } from '@/lib/googleAuth';
import type { AuthUser, PublicRegistrationRole } from '@/lib/types';

export type { AuthUser, PublicRegistrationRole, UserRole } from '@/lib/types';

export type GoogleAuthResult = {
  user?: AuthUser;
  requiresRoleSelection?: boolean;
  signupToken?: string;
  email?: string;
  name?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
    role?: PublicRegistrationRole,
  ) => Promise<AuthUser>;
  loginWithGoogle: (options: {
    credential?: string;
    signupToken?: string;
    role?: PublicRegistrationRole;
  }) => Promise<GoogleAuthResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resetSessionState = useCallback(() => {
    clearClientAuthStorage();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (!cancelled) {
          clearClientAuthStorage();
          setIsLoading(false);
        }
        return;
      }

      // UX hint for middleware only — auth still requires /users/me/ success.
      setSessionHintCookie();

      try {
        const { data } = await api.get<AuthUser>('/users/me/');
        if (cancelled) {
          return;
        }
        setToken(storedToken);
        setUser(data);
        localStorage.setItem(USER_KEY, JSON.stringify(data));
        setSessionHintCookie();
      } catch {
        if (!cancelled) {
          resetSessionState();
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
  }, [resetSessionState]);

  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
      setIsLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setSessionHintCookie();
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
      return data.user;
    },
    [persistSession],
  );

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      confirmPassword: string,
      role: PublicRegistrationRole = 'BUYER',
    ) => {
      const payload = buildRegisterPayload({
        username,
        email,
        password,
        confirmPassword,
        role,
      });
      const { data } = await api.post<{ token: string; user: AuthUser }>(
        '/users/register/',
        payload,
      );
      persistSession(data.token, data.user);
      toast.success(`Account created. Welcome, ${data.user.username}!`);
      return data.user;
    },
    [persistSession],
  );

  const loginWithGoogle = useCallback(
    async (options: {
      credential?: string;
      signupToken?: string;
      role?: PublicRegistrationRole;
    }): Promise<GoogleAuthResult> => {
      const payload = buildGoogleAuthPayload(options);
      const data = await authenticateWithGoogle(payload);

      if (data.requires_role_selection) {
        return {
          requiresRoleSelection: true,
          signupToken: data.signup_token,
          email: data.email,
          name: data.name,
        };
      }

      if (data.token && data.user) {
        persistSession(data.token, data.user);
        toast.success(`Welcome, ${data.user.username}!`);
        return { user: data.user };
      }

      throw new Error('Google authentication returned incomplete user details.');
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/users/logout/');
    } catch {
      // Always clear local session even if revocation fails.
    } finally {
      resetSessionState();
      toast.success('Logged out successfully.');
    }
  }, [resetSessionState]);

  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      resetSessionState();
      return null;
    }
    try {
      const { data } = await api.get<AuthUser>('/users/me/');
      setToken(storedToken);
      setUser(data);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      setSessionHintCookie();
      return data;
    } catch {
      resetSessionState();
      return null;
    }
  }, [resetSessionState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      // Requires backend-verified user from /users/me/ (or login/register).
      isAuthenticated: Boolean(token && user),
      login,
      register,
      loginWithGoogle,
      logout,
      refreshUser,
    }),
    [user, token, isLoading, login, register, loginWithGoogle, logout, refreshUser],
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
