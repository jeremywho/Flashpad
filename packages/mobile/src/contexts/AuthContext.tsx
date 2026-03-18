import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient, SignalRManager } from '@flashpad/shared';
import type { User } from '@flashpad/shared';
import { getApiUrl } from '../config';

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day before expiry

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create API client with current config URL - memoized to prevent recreation
  const api = useMemo(() => new ApiClient(getApiUrl()), []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(async () => {
    clearRefreshTimer();
    await AsyncStorage.removeItem('token');
    api.logout();
    SignalRManager.clear();
    setUser(null);
  }, [api, clearRefreshTimer]);

  const scheduleRefresh = useCallback((logoutFn: () => void) => {
    clearRefreshTimer();
    const expiryMs = api.getTokenExpiryMs();
    if (!expiryMs) return;

    const now = Date.now();
    const timeUntilExpiry = expiryMs - now;
    if (timeUntilExpiry <= 0) {
      logoutFn();
      return;
    }

    const delay = Math.max(timeUntilExpiry - REFRESH_BUFFER_MS, 0);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const response = await api.refreshToken();
        await AsyncStorage.setItem('token', response.token);
        setUser(response.user);
        scheduleRefresh(logoutFn);
      } catch {
        logoutFn();
      }
    }, delay);
  }, [api, clearRefreshTimer]);

  const loadUser = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        api.setToken(token);
        const userData = await api.getCurrentUser();
        setUser(userData);
        scheduleRefresh(logout);
      }
    } catch {
      await AsyncStorage.removeItem('token');
      api.setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [api, scheduleRefresh, logout]);

  useEffect(() => {
    loadUser();
    return clearRefreshTimer;
  }, [loadUser, clearRefreshTimer]);

  const login = useCallback(async (token: string, userData: User) => {
    await AsyncStorage.setItem('token', token);
    api.setToken(token);
    setUser(userData);
    scheduleRefresh(logout);
  }, [api, scheduleRefresh, logout]);

  const contextValue = useMemo(
    () => ({ user, api, isLoading, login, logout }),
    [user, api, isLoading, login, logout]
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
