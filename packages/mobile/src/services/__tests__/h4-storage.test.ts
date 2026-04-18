import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LogEntry } from '@flashpad/shared';
import { AsyncStorageH4Storage } from '../h4-storage';
import { setApiEnvironment } from '../../config';

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

describe('AsyncStorageH4Storage', () => {
  beforeEach(async () => {
    mockStorage.clear();
    jest.clearAllMocks();
    await setApiEnvironment('local');
  });

  it('keeps pending telemetry isolated by environment', async () => {
    const storage = new AsyncStorageH4Storage();
    const localEntry: LogEntry = {
      level: 'info',
      message: 'local entry',
      source: 'mobile',
      deviceId: 'device-local',
      timestamp: '2026-04-12T12:00:00.000Z',
    };
    const productionEntry: LogEntry = {
      level: 'warning',
      message: 'production entry',
      source: 'mobile',
      deviceId: 'device-prod',
      timestamp: '2026-04-12T12:05:00.000Z',
    };

    await storage.save([localEntry]);

    await setApiEnvironment('production');
    expect(await storage.loadAndClear()).toEqual([]);

    await storage.save([productionEntry]);
    expect(await storage.loadAndClear()).toEqual([productionEntry]);

    await setApiEnvironment('local');
    expect(await storage.loadAndClear()).toEqual([localEntry]);

    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(2);
  });
});
