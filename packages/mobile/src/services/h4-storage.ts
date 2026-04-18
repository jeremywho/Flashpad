import AsyncStorage from '@react-native-async-storage/async-storage';
import type { H4LogStorage, LogEntry } from '@flashpad/shared';
import { getNamespacedStorageKey } from '../config';

const STORAGE_KEY = 'h4_pending_logs';

/**
 * AsyncStorage-backed log persistence for React Native.
 * Implements the H4LogStorage interface for the shared h4-client logger.
 */
export class AsyncStorageH4Storage implements H4LogStorage {
  async save(entries: LogEntry[]): Promise<void> {
    try {
      const existing = await this.load();
      const merged = [...existing, ...entries];
      // Cap at 500 entries to prevent storage bloat
      const capped = merged.length > 500 ? merged.slice(-500) : merged;
      await AsyncStorage.setItem(getNamespacedStorageKey(STORAGE_KEY), JSON.stringify(capped));
    } catch {
      // Silent failure — better to lose logs than crash the app
    }
  }

  async loadAndClear(): Promise<LogEntry[]> {
    try {
      const entries = await this.load();
      if (entries.length > 0) {
        await AsyncStorage.removeItem(getNamespacedStorageKey(STORAGE_KEY));
      }
      return entries;
    } catch {
      return [];
    }
  }

  private async load(): Promise<LogEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(getNamespacedStorageKey(STORAGE_KEY));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}
