/**
 * Client-side H4 logger.
 * Buffers log entries in memory and flushes to /api/client-logs on the backend.
 * On flush failure (offline), persists entries via a storage adapter so they survive app restarts.
 * On init, loads any persisted entries and attempts to send them.
 *
 * Storage adapters:
 * - IndexedDB (default, auto-detected in browser/Electron environments)
 * - Custom: pass a storage adapter via H4ClientOptions for other environments (e.g. AsyncStorage)
 */

export interface H4ClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  source: string; // 'electron' | 'web' | 'mobile'
  deviceId: string;
  flushIntervalMs?: number;
  bufferSize?: number;
  /** Custom storage adapter for log persistence. Falls back to IndexedDB, then in-memory. */
  storage?: H4LogStorage;
}

/** Storage adapter interface for persisting logs across app restarts. */
export interface H4LogStorage {
  /** Save log entries to persistent storage. */
  save(entries: LogEntry[]): Promise<void>;
  /** Load all persisted entries and clear them from storage. */
  loadAndClear(): Promise<LogEntry[]>;
}

export interface LogEntry {
  level: string;
  message: string;
  source: string;
  deviceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// --- Built-in IndexedDB storage adapter ---

const DB_NAME = 'h4-logs';
const STORE_NAME = 'pending';
const DB_VERSION = 1;

class IndexedDBStorage implements H4LogStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return false;

    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { autoIncrement: true });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(true);
        };

        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async save(entries: LogEntry[]): Promise<void> {
    if (!this.db || entries.length === 0) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const entry of entries) {
          store.add(entry);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async loadAndClear(): Promise<LogEntry[]> {
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getAll = store.getAll();

        tx.oncomplete = () => {
          const entries = getAll.result as LogEntry[];
          if (entries.length > 0) {
            const clearTx = this.db!.transaction(STORE_NAME, 'readwrite');
            clearTx.objectStore(STORE_NAME).clear();
          }
          resolve(entries);
        };

        tx.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// --- H4 Client Logger ---

class H4ClientLogger {
  private options: H4ClientOptions | null = null;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private storage: H4LogStorage | null = null;
  private idbStorage: IndexedDBStorage | null = null;

  init(options: H4ClientOptions): void {
    this.options = options;
    const interval = options.flushIntervalMs ?? 5000;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => this.flush(), interval);

    // Set up storage adapter
    if (options.storage) {
      // Custom storage provided (e.g. AsyncStorage adapter)
      this.storage = options.storage;
      this.storage.loadAndClear().then((entries) => {
        if (entries.length > 0) {
          this.buffer.unshift(...entries);
        }
        this.flush();
      });
    } else {
      // Try IndexedDB (available in Electron/web, not React Native)
      this.idbStorage = new IndexedDBStorage();
      this.idbStorage.init().then((available) => {
        if (available) {
          this.storage = this.idbStorage;
          this.storage!.loadAndClear().then((entries) => {
            if (entries.length > 0) {
              this.buffer.unshift(...entries);
            }
            this.flush();
          });
        } else {
          this.flush();
        }
      });
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Persist any remaining buffered logs before shutdown
    if (this.storage && this.buffer.length > 0) {
      this.storage.save(this.buffer);
    }
    this.buffer = [];
    if (this.idbStorage) {
      this.idbStorage.close();
      this.idbStorage = null;
    }
    this.storage = null;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('Debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('Info', message, metadata);
  }

  warning(message: string, metadata?: Record<string, unknown>): void {
    this.log('Warning', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('Error', message, metadata);
  }

  private log(level: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      source: this.options?.source ?? 'unknown',
      deviceId: this.options?.deviceId ?? 'unknown',
      timestamp: new Date().toISOString(),
      metadata,
    };
    this.buffer.push(entry);

    // Auto-flush if buffer is full
    if (this.buffer.length >= (this.options?.bufferSize ?? 20)) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (!this.options || this.buffer.length === 0 || this.flushing) return;

    this.flushing = true;
    const batch = [...this.buffer];
    this.buffer = [];

    try {
      const token = this.options.getToken();
      if (!token) {
        await this.persistOrBuffer(batch);
        return;
      }

      const response = await fetch(`${this.options.baseUrl}/api/client-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logs: batch }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 400) {
          console.warn(`[h4-client] Dropping ${batch.length} logs: HTTP ${response.status}`);
          return;
        }
        await this.persistOrBuffer(batch);
      }
    } catch {
      await this.persistOrBuffer(batch);
    } finally {
      this.flushing = false;
    }
  }

  private async persistOrBuffer(entries: LogEntry[]): Promise<void> {
    if (this.storage) {
      await this.storage.save(entries);
    } else {
      // No storage available — keep in memory with cap
      this.buffer.unshift(...entries);
      if (this.buffer.length > 500) {
        this.buffer = this.buffer.slice(-500);
      }
    }
  }
}

/** Singleton client-side H4 logger. Call h4.init() before use. */
export const h4 = new H4ClientLogger();
