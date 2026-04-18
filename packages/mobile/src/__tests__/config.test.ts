import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getApiEnvironment,
  getApiUrl,
  getNamespacedStorageKey,
  initConfig,
  setApiEnvironment,
  subscribeToConfigChanges,
} from '../config';

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
  },
}));

describe('mobile config', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  it('migrates the legacy production toggle key to the new environment key', async () => {
    mockStorage.set('@flashpad_use_production', 'true');

    await initConfig();

    expect(getApiEnvironment()).toBe('production');
    expect(mockStorage.get('@flashpad_api_environment')).toBe('production');
    expect(mockStorage.has('@flashpad_use_production')).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@flashpad_use_production');
  });

  it('notifies subscribers and derives namespaced storage keys from the active environment', async () => {
    await setApiEnvironment('local');

    const listener = jest.fn();
    const unsubscribe = subscribeToConfigChanges(listener);

    await setApiEnvironment('production');

    expect(listener).toHaveBeenCalledWith('production');
    expect(getApiEnvironment()).toBe('production');
    expect(getApiUrl()).toBe('https://api.flashpad.cc');
    expect(getNamespacedStorageKey('notes')).toBe('@flashpad:production:notes');

    unsubscribe();
  });
});
