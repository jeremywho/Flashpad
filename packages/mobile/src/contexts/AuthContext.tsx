import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { ApiClient, SignalRManager, HttpError, SessionRefresher } from '@flashpad/shared';
import type { User } from '@flashpad/shared';
import type { ApiEnvironment } from '../config';
import { getApiEnvironment, getApiUrl, setApiEnvironment } from '../config';
import {
  clearStoredAuthState,
  clearUserSessionData,
  getCachedUser,
  getStoredRefreshToken,
  storeCachedUser,
  storeRefreshToken,
} from '../services/authStorage';

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  hasAccessToken: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  switchEnvironment: (environment: ApiEnvironment) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const refreshTokenRef = useRef<string | null>(null);
  const refresherRef = useRef<SessionRefresher | null>(null);

  // Create API client with current config URL - memoized to prevent recreation
  const api = useMemo(() => new ApiClient(getApiUrl()), []);

  const stopRefresher = useCallback(() => {
    refresherRef.current?.stop();
  }, []);

  const disconnectClient = useCallback(async () => {
    api.logout();
    await SignalRManager.clear();
    setUser(null);
    setHasAccessToken(false);
  }, [api]);

  const resetAuthState = useCallback(async () => {
    stopRefresher();
    refreshTokenRef.current = null;
    await clearStoredAuthState();
    await disconnectClient();
  }, [stopRefresher, disconnectClient]);

  const clearCurrentSession = useCallback(async () => {
    stopRefresher();
    const refreshToken = refreshTokenRef.current;
    refreshTokenRef.current = null;

    if (refreshToken) {
      void api.logoutSession(refreshToken).catch(() => undefined);
    }
  }, [api, stopRefresher]);

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
          await storeRefreshToken(response.refreshToken);
          await storeCachedUser(response.user);
          setUser(response.user);
          setHasAccessToken(true);
        },
        onRejected: () => {
          void resetAuthState();
        },
      });
    }
    return refresherRef.current;
  }, [api, resetAuthState]);

  const switchEnvironment = useCallback(async (environment: ApiEnvironment) => {
    if (environment === getApiEnvironment()) {
      return;
    }

    await clearCurrentSession();
    await clearStoredAuthState();
    await disconnectClient();
    await setApiEnvironment(environment);
  }, [clearCurrentSession, disconnectClient]);

  const logout = useCallback(async () => {
    await clearCurrentSession();
    await clearUserSessionData();
    await disconnectClient();
  }, [clearCurrentSession, disconnectClient]);

  useEffect(() => {
    let cancelled = false;
    const refresher = getRefresher();

    (async () => {
      try {
        const refreshToken = await getStoredRefreshToken();
        if (cancelled || !refreshToken) return;

        refreshTokenRef.current = refreshToken;
        refresher.start();
        const refreshed = await refresher.refreshNow();
        if (cancelled) return;
        if (!refreshed && refresher.isRunning) {
          setUser(await getCachedUser());
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') refresher.refreshIfDue();
    });

    return () => {
      cancelled = true;
      refresher.stop();
      appStateSubscription.remove();
    };
  }, [getRefresher]);

  const login = useCallback(async (accessToken: string, refreshToken: string, userData: User) => {
    refreshTokenRef.current = refreshToken;
    await storeRefreshToken(refreshToken);
    await storeCachedUser(userData);
    api.setToken(accessToken);
    setUser(userData);
    setHasAccessToken(true);
    getRefresher().start();
  }, [api, getRefresher]);

  const contextValue = useMemo(
    () => ({ user, api, isLoading, hasAccessToken, login, logout, switchEnvironment }),
    [user, api, isLoading, hasAccessToken, login, logout, switchEnvironment]
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
