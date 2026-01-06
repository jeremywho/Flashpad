import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from '@flashpad/shared';
import type { User } from '@flashpad/shared';
import { getApiUrl } from '../config';

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

  // Create API client with current config URL - memoized to prevent recreation
  const api = useMemo(() => new ApiClient(getApiUrl()), []);

  const loadUser = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        api.setToken(token);
        const userData = await api.getCurrentUser();
        setUser(userData);
      }
    } catch {
      await AsyncStorage.removeItem('token');
      api.setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (token: string, userData: User) => {
    await AsyncStorage.setItem('token', token);
    api.setToken(token);
    setUser(userData);
  }, [api]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem('token');
    api.logout();
    setUser(null);
  }, [api]);

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
