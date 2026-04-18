import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '@shared/api-client';
import { User, SignalRManager } from '@shared/index';

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = window.electron.app.apiBaseUrl || import.meta.env.VITE_API_URL || 'http://localhost:5000';
const api = new ApiClient(API_URL);

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day before expiry

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((onLogout: () => void) => {
    clearRefreshTimer();
    const expiryMs = api.getTokenExpiryMs();
    if (!expiryMs) return;

    const now = Date.now();
    const timeUntilExpiry = expiryMs - now;
    if (timeUntilExpiry <= 0) {
      onLogout();
      return;
    }

    const delay = Math.max(timeUntilExpiry - REFRESH_BUFFER_MS, 0);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const currentRefreshToken = refreshTokenRef.current;
        if (!currentRefreshToken) {
          onLogout();
          return;
        }

        const response = await api.refreshToken(currentRefreshToken);
        refreshTokenRef.current = response.refreshToken;
        setUser(response.user);
        scheduleRefresh(onLogout);
      } catch {
        onLogout();
      }
    }, delay);
  }, [clearRefreshTimer]);

  const logout = useCallback(() => {
    clearRefreshTimer();
    const refreshToken = refreshTokenRef.current;
    refreshTokenRef.current = null;
    if (refreshToken) {
      void api.logoutSession(refreshToken).catch(() => undefined);
    }
    api.logout();
    void window.electron.auth.setSessionActive(false);
    SignalRManager.clear();
    setUser(null);
  }, [clearRefreshTimer]);

  useEffect(() => {
    void window.electron.auth.setSessionActive(false);
    setIsLoading(false);
    return clearRefreshTimer;
  }, [scheduleRefresh, logout, clearRefreshTimer]);

  const login = (accessToken: string, refreshToken: string, userData: User) => {
    refreshTokenRef.current = refreshToken;
    api.setToken(accessToken);
    void window.electron.auth.setSessionActive(true);
    setUser(userData);
    scheduleRefresh(logout);
  };

  return (
    <AuthContext.Provider value={{ user, api, isLoading, login, logout }}>
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
