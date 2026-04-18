import AsyncStorage from '@react-native-async-storage/async-storage';
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

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => mockStorage.delete(key));
    }),
  },
}));

jest.mock('../database', () => ({
  clearLocalData: jest.fn(),
}));

describe('clearUserSessionData', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  it('clears the current environment auth state and prior-user offline data together', async () => {
    await setApiEnvironment('local');
    (clearLocalData as jest.Mock).mockResolvedValue(undefined);

    await clearUserSessionData();

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      getNamespacedStorageKey(AUTH_TOKEN_STORAGE_KEY, 'local'),
      getNamespacedStorageKey(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'local'),
    ]);
    expect(clearLocalData).toHaveBeenCalledTimes(1);
  });

  it('keeps refresh tokens isolated per environment', async () => {
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
});
