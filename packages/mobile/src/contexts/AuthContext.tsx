import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ApiClient, SignalRManager } from '@flashpad/shared';
import type { User } from '@flashpad/shared';
import type { ApiEnvironment } from '../config';
import { getApiEnvironment, getApiUrl, setApiEnvironment } from '../config';
import {
  clearStoredAuthState,
  clearUserSessionData,
  getStoredRefreshToken,
  storeRefreshToken,
} from '../services/authStorage';

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day before expiry

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  switchEnvironment: (environment: ApiEnvironment) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  // Create API client with current config URL - memoized to prevent recreation
  const api = useMemo(() => new ApiClient(getApiUrl()), []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const disconnectClient = useCallback(async () => {
    api.logout();
    await SignalRManager.clear();
    setUser(null);
  }, [api]);

  const resetAuthState = useCallback(async () => {
    clearRefreshTimer();
    refreshTokenRef.current = null;
    await clearStoredAuthState();
    await disconnectClient();
  }, [clearRefreshTimer, disconnectClient]);

  const clearCurrentSession = useCallback(async () => {
    clearRefreshTimer();
    const refreshToken = refreshTokenRef.current;
    refreshTokenRef.current = null;

    if (refreshToken) {
      void api.logoutSession(refreshToken).catch(() => undefined);
    }
  }, [api, clearRefreshTimer]);

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

  const scheduleRefresh = useCallback((onAuthFailure: () => Promise<void>) => {
    clearRefreshTimer();
    const expiryMs = api.getTokenExpiryMs();
    if (!expiryMs) return;

    const now = Date.now();
    const timeUntilExpiry = expiryMs - now;
    if (timeUntilExpiry <= 0) {
      void onAuthFailure();
      return;
    }

    const delay = Math.max(timeUntilExpiry - REFRESH_BUFFER_MS, 0);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const currentRefreshToken = refreshTokenRef.current;
        if (!currentRefreshToken) {
          await onAuthFailure();
          return;
        }

        const response = await api.refreshToken(currentRefreshToken);
        refreshTokenRef.current = response.refreshToken;
        await storeRefreshToken(response.refreshToken);
        setUser(response.user);
        scheduleRefresh(onAuthFailure);
      } catch {
        await onAuthFailure();
      }
    }, delay);
  }, [api, clearRefreshTimer]);

  const loadUser = useCallback(async () => {
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        refreshTokenRef.current = refreshToken;
        const response = await api.refreshToken(refreshToken);
        refreshTokenRef.current = response.refreshToken;
        await storeRefreshToken(response.refreshToken);
        setUser(response.user);
        scheduleRefresh(resetAuthState);
      }
    } catch {
      await resetAuthState();
    } finally {
      setIsLoading(false);
    }
  }, [api, scheduleRefresh, resetAuthState]);

  useEffect(() => {
    loadUser();
    return clearRefreshTimer;
  }, [loadUser, clearRefreshTimer]);

  const login = useCallback(async (accessToken: string, refreshToken: string, userData: User) => {
    refreshTokenRef.current = refreshToken;
    await storeRefreshToken(refreshToken);
    api.setToken(accessToken);
    setUser(userData);
    scheduleRefresh(resetAuthState);
  }, [api, scheduleRefresh, resetAuthState]);

  const contextValue = useMemo(
    () => ({ user, api, isLoading, login, logout, switchEnvironment }),
    [user, api, isLoading, login, logout, switchEnvironment]
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
