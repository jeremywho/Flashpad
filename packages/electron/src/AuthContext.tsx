import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ApiClient } from '@shared/api-client';
import { User, SignalRManager, HttpError, SessionRefresher } from '@shared/index';

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  hasAccessToken: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = window.electron.app.apiBaseUrl || import.meta.env.VITE_API_URL || 'http://localhost:5000';
const api = new ApiClient(API_URL);
const USER_STORAGE_KEY = 'flashpad-auth-user';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

async function persistRefreshToken(refreshToken: string): Promise<void> {
  await window.electron.auth.setRefreshToken(refreshToken).catch((err) => {
    console.warn('[auth] setRefreshToken failed:', err);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const refreshTokenRef = useRef<string | null>(null);
  const refresherRef = useRef<SessionRefresher | null>(null);

  const clearLocalSession = useCallback(() => {
    refresherRef.current?.stop();
    refreshTokenRef.current = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    api.logout();
    void window.electron.auth.setSessionActive(false);
    void window.electron.auth.clearRefreshToken().catch(() => undefined);
    SignalRManager.clear();
    setUser(null);
    setHasAccessToken(false);
  }, []);

  const getRefresher = useCallback(() => {
    if (!refresherRef.current) {
      refresherRef.current = new SessionRefresher({
        getAccessTokenExpiryMs: () => api.getTokenExpiryMs(),
        refresh: async () => {
          const currentRefreshToken = refreshTokenRef.current;
          if (!currentRefreshToken) {
            throw new HttpError(401, 'Signed out');
          }
          const response = await api.refreshToken(currentRefreshToken);
          refreshTokenRef.current = response.refreshToken;
          await persistRefreshToken(response.refreshToken);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
          setUser(response.user);
          setHasAccessToken(true);
          void window.electron.auth.setSessionActive(true);
        },
        onRejected: clearLocalSession,
      });
    }
    return refresherRef.current;
  }, [clearLocalSession]);

  const logout = useCallback(() => {
    const refreshToken = refreshTokenRef.current;
    if (refreshToken) {
      void api.logoutSession(refreshToken).catch(() => undefined);
    }
    clearLocalSession();
  }, [clearLocalSession]);

  const refreshSession = useCallback(() => getRefresher().refreshNow(), [getRefresher]);

  useEffect(() => {
    let cancelled = false;
    const refresher = getRefresher();

    const handleWake = () => {
      if (document.visibilityState === 'visible') refresher.refreshIfDue();
    };
    const handleOnline = () => refresher.refreshIfDue();

    (async () => {
      // Only the primary (main) window owns token refresh. Secondary windows
      // (quick-capture) read their auth state from the main process via IPC and
      // must NOT refresh here — doing so rotates the single-use refresh token out
      // from under the main window and forces a re-login for every window.
      const isPrimary = await window.electron.auth.isPrimaryWindow();
      if (cancelled) return;
      if (!isPrimary) {
        setIsLoading(false);
        return;
      }

      document.addEventListener('visibilitychange', handleWake);
      window.addEventListener('online', handleOnline);

      try {
        const storedRefreshToken = await window.electron.auth.getRefreshToken();
        if (cancelled) return;

        if (!storedRefreshToken) {
          void window.electron.auth.setSessionActive(false);
          return;
        }

        refreshTokenRef.current = storedRefreshToken;
        refresher.start();
        const refreshed = await refresher.refreshNow();
        if (cancelled) return;
        if (!refreshed && refresher.isRunning) {
          const cachedUser = readCachedUser();
          setUser(cachedUser);
          void window.electron.auth.setSessionActive(cachedUser !== null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      refresher.stop();
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('online', handleOnline);
    };
  }, [getRefresher]);

  const login = useCallback((accessToken: string, refreshToken: string, userData: User) => {
    refreshTokenRef.current = refreshToken;
    api.setToken(accessToken);
    void persistRefreshToken(refreshToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    void window.electron.auth.setSessionActive(true);
    setUser(userData);
    setHasAccessToken(true);
    getRefresher().start();
  }, [getRefresher]);

  // Stable context value — without useMemo, every re-render (e.g. from AuthProvider's
  // internal state changing) produces a new object and cascades re-renders through
  // every consumer that destructures useAuth(), breaking downstream React.memo.
  const contextValue = useMemo(
    () => ({ user, api, isLoading, hasAccessToken, login, logout, refreshSession }),
    [user, isLoading, hasAccessToken, login, logout, refreshSession]
  );

  return (
    <AuthContext.Provider value={contextValue}>
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
