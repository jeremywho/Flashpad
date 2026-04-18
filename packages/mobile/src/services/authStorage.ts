import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalData } from './database';
import { getNamespacedStorageKey } from '../config';

export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'refresh_token';

function getAuthTokenStorageKey(): string {
  return getNamespacedStorageKey(AUTH_TOKEN_STORAGE_KEY);
}

function getRefreshTokenStorageKey(): string {
  return getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(getRefreshTokenStorageKey());
}

export async function storeRefreshToken(refreshToken: string): Promise<void> {
  await AsyncStorage.setItem(getRefreshTokenStorageKey(), refreshToken);
}

export async function clearStoredAuthState(): Promise<void> {
  await AsyncStorage.multiRemove([
    getAuthTokenStorageKey(),
    getRefreshTokenStorageKey(),
  ]);
}

export async function clearUserSessionData(): Promise<void> {
  await Promise.all([
    clearStoredAuthState(),
    clearLocalData(),
  ]);
}
