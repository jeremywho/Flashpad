import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '@shared/api-client';
import { User, SignalRManager, HttpError, SessionRefresher } from '@shared/index';

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const api = new ApiClient(API_URL);
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';
const USER_STORAGE_KEY = 'authUser';
const REFRESH_LOCK_NAME = 'flashpad-auth-refresh';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

// Tabs share one refresh token and the server rotates it on every use, so
// refreshes must be serialized across tabs and always read the latest token.
function withCrossTabRefreshLock(work: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request<void>(REFRESH_LOCK_NAME, work);
  }
  return work();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refresherRef = useRef<SessionRefresher | null>(null);

  const clearLocalSession = useCallback(() => {
    refresherRef.current?.stop();
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    api.logout();
    SignalRManager.clear();
    setUser(null);
  }, []);

  const getRefresher = useCallback(() => {
    if (!refresherRef.current) {
      refresherRef.current = new SessionRefresher({
        getAccessTokenExpiryMs: () => api.getTokenExpiryMs(),
        refresh: () => withCrossTabRefreshLock(async () => {
          const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
          if (!storedRefreshToken) {
            throw new HttpError(401, 'Signed out');
          }
          const response = await api.refreshToken(storedRefreshToken);
          localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, response.refreshToken);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
          setUser(response.user);
        }),
        onRejected: clearLocalSession,
      });
    }
    return refresherRef.current;
  }, [clearLocalSession]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (refreshToken) {
      void api.logoutSession(refreshToken).catch(() => undefined);
    }
    clearLocalSession();
  }, [clearLocalSession]);

  useEffect(() => {
    const refresher = getRefresher();
    let cancelled = false;

    if (localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
      refresher.start();
      void refresher.refreshNow().then((refreshed) => {
        if (cancelled) return;
        if (!refreshed && refresher.isRunning) {
          setUser(readCachedUser());
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }

    const handleWake = () => {
      if (document.visibilityState === 'visible') refresher.refreshIfDue();
    };
    const handleOnline = () => refresher.refreshIfDue();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === REFRESH_TOKEN_STORAGE_KEY && event.newValue === null && refresher.isRunning) {
        clearLocalSession();
      }
    };

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('online', handleOnline);
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      refresher.stop();
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [getRefresher, clearLocalSession]);

  const login = (accessToken: string, refreshToken: string, userData: User) => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    api.setToken(accessToken);
    setUser(userData);
    getRefresher().start();
  };

  return (
    <AuthContext.Provider
      value={{ user, api, isAuthenticated: !!user, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
