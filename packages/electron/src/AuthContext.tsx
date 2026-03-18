import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '@shared/api-client';
import { User, SignalRManager } from '@shared/index';

interface AuthContextType {
  user: User | null;
  api: ApiClient;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const api = new ApiClient(API_URL);

const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day before expiry

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const response = await api.refreshToken();
        localStorage.setItem('token', response.token);
        setUser(response.user);
        scheduleRefresh(onLogout);
      } catch {
        onLogout();
      }
    }, delay);
  }, [clearRefreshTimer]);

  const logout = useCallback(() => {
    clearRefreshTimer();
    localStorage.removeItem('token');
    api.logout();
    SignalRManager.clear();
    setUser(null);
  }, [clearRefreshTimer]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.setToken(token);
      api
        .getCurrentUser()
        .then((userData) => {
          setUser(userData);
          scheduleRefresh(logout);
        })
        .catch(() => {
          localStorage.removeItem('token');
          api.setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
    return clearRefreshTimer;
  }, [scheduleRefresh, logout, clearRefreshTimer]);

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token);
    api.setToken(token);
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
