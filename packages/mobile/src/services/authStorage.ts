import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import type { User } from '@flashpad/shared';
import { clearLocalData } from './database';
import { getNamespacedStorageKey } from '../config';

// Legacy AsyncStorage keys (used before keychain migration; kept for one-time
// migration + defensive cleanup on logout).
export const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
export const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'refresh_token';
export const AUTH_USER_STORAGE_KEY = 'auth_user';

const KEYCHAIN_USERNAME = 'flashpad-refresh-token';

function getLegacyAuthTokenKey(): string {
  return getNamespacedStorageKey(AUTH_TOKEN_STORAGE_KEY);
}

function getLegacyRefreshTokenKey(): string {
  return getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY);
}

function getCachedUserKey(): string {
  return getNamespacedStorageKey(AUTH_USER_STORAGE_KEY);
}

function getKeychainService(): string {
  return getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const service = getKeychainService();
  try {
    const creds = await Keychain.getGenericPassword({ service });
    if (creds && creds.password) {
      return creds.password;
    }
  } catch {
    // fall through to legacy migration attempt
  }

  const legacy = await AsyncStorage.getItem(getLegacyRefreshTokenKey()).catch(() => null);
  if (!legacy) return null;

  try {
    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, legacy, { service });
    await AsyncStorage.removeItem(getLegacyRefreshTokenKey()).catch(() => undefined);
  } catch {
    // Keychain unavailable; leave legacy in place so a later attempt can migrate.
  }
  return legacy;
}

export async function storeRefreshToken(refreshToken: string): Promise<void> {
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, refreshToken, {
    service: getKeychainService(),
  });
  await AsyncStorage.removeItem(getLegacyRefreshTokenKey()).catch(() => undefined);
}

export async function storeCachedUser(user: User): Promise<void> {
  await AsyncStorage.setItem(getCachedUserKey(), JSON.stringify(user)).catch(() => undefined);
}

export async function getCachedUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(getCachedUserKey());
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export async function clearStoredAuthState(): Promise<void> {
  await Keychain.resetGenericPassword({ service: getKeychainService() }).catch(() => undefined);
  await AsyncStorage.multiRemove([
    getLegacyAuthTokenKey(),
    getLegacyRefreshTokenKey(),
    getCachedUserKey(),
  ]).catch(() => undefined);
}

export async function clearUserSessionData(): Promise<void> {
  await Promise.all([
    clearStoredAuthState(),
    clearLocalData(),
  ]);
}
