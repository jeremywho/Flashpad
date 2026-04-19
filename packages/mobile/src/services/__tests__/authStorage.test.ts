import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { clearLocalData } from '../database';
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredAuthState,
  clearUserSessionData,
  getStoredRefreshToken,
  storeRefreshToken,
} from '../authStorage';
import { getNamespacedStorageKey, setApiEnvironment } from '../../config';

const mockAsyncStorage = new Map<string, string>();
const mockKeychainStorage = new Map<string, { username: string; password: string }>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockAsyncStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorage.delete(key);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => mockAsyncStorage.delete(key));
    }),
  },
}));

jest.mock('react-native-keychain', () => ({
  __esModule: true,
  setGenericPassword: jest.fn(async (username: string, password: string, options: { service: string }) => {
    mockKeychainStorage.set(options.service, { username, password });
    return true;
  }),
  getGenericPassword: jest.fn(async (options: { service: string }) => {
    const entry = mockKeychainStorage.get(options.service);
    return entry ?? false;
  }),
  resetGenericPassword: jest.fn(async (options: { service: string }) => {
    return mockKeychainStorage.delete(options.service);
  }),
}));

jest.mock('../database', () => ({
  clearLocalData: jest.fn(),
}));

describe('authStorage', () => {
  beforeEach(() => {
    mockAsyncStorage.clear();
    mockKeychainStorage.clear();
    jest.clearAllMocks();
  });

  it('clearUserSessionData clears keychain + legacy AsyncStorage + local data together', async () => {
    await setApiEnvironment('local');
    (clearLocalData as jest.Mock).mockResolvedValue(undefined);

    await clearUserSessionData();

    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'local'),
    });
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      getNamespacedStorageKey(AUTH_TOKEN_STORAGE_KEY, 'local'),
      getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'local'),
    ]);
    expect(clearLocalData).toHaveBeenCalledTimes(1);
  });

  it('keeps refresh tokens isolated per environment via keychain service name', async () => {
    await setApiEnvironment('local');
    await storeRefreshToken('local-refresh-token');

    expect(await getStoredRefreshToken()).toBe('local-refresh-token');

    await setApiEnvironment('production');
    expect(await getStoredRefreshToken()).toBeNull();

    await storeRefreshToken('prod-refresh-token');
    expect(await getStoredRefreshToken()).toBe('prod-refresh-token');

    await clearStoredAuthState();
    expect(await getStoredRefreshToken()).toBeNull();

    await setApiEnvironment('local');
    expect(await getStoredRefreshToken()).toBe('local-refresh-token');
  });

  it('stores refresh tokens in the keychain, not AsyncStorage', async () => {
    await setApiEnvironment('local');
    const refreshKey = getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'local');
    await storeRefreshToken('my-token');

    expect(Keychain.setGenericPassword).toHaveBeenCalled();
    // The refresh token is never persisted in AsyncStorage (setApiEnvironment
    // uses its own AsyncStorage key, which is fine).
    expect(mockAsyncStorage.has(refreshKey)).toBe(false);
  });

  it('migrates a pre-keychain AsyncStorage refresh token into the keychain on first read', async () => {
    await setApiEnvironment('local');
    const legacyKey = getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'local');

    // Simulate a refresh token left over from the previous version.
    mockAsyncStorage.set(legacyKey, 'legacy-token');

    const token = await getStoredRefreshToken();
    expect(token).toBe('legacy-token');

    // After the read, the legacy entry should be gone and the keychain should hold it.
    expect(mockAsyncStorage.has(legacyKey)).toBe(false);
    expect(mockKeychainStorage.get(legacyKey)?.password).toBe('legacy-token');

    // Subsequent reads come straight from the keychain.
    expect(await getStoredRefreshToken()).toBe('legacy-token');
  });
});
