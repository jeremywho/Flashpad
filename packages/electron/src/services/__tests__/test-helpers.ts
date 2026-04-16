/**
 * In-memory mock of window.electron for testing database.ts, syncManager.ts, etc.
 * Simulates the IPC bridge without needing an Electron runtime.
 */

export interface MockNoteStore {
  notes: Map<string, string>; // id -> file content
  json: Map<string, unknown>; // filename -> parsed JSON
}

export function createMockStore(): MockNoteStore {
  return {
    notes: new Map(),
    json: new Map(),
  };
}

export function createMockElectron(store: MockNoteStore) {
  const fileChangedCallbacks: Array<(event: { type: string; filename: string; filePath: string }) => void> = [];

  return {
    onUpdateDownloaded: jest.fn(),
    removeUpdateListener: jest.fn(),
    onRefreshNotes: jest.fn(),
    removeRefreshNotesListener: jest.fn(),
    settings: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      reset: jest.fn().mockResolvedValue({}),
    },
    app: {
      getVersion: jest.fn().mockResolvedValue('0.0.0-test'),
      checkForUpdates: jest.fn().mockResolvedValue(undefined),
    },
    quickCapture: {
      close: jest.fn().mockResolvedValue(undefined),
      getAuthToken: jest.fn().mockResolvedValue(null),
      notifyNoteCreated: jest.fn().mockResolvedValue(undefined),
    },
    quickCaptureCode: {
      close: jest.fn().mockResolvedValue(undefined),
    },
    fs: {
      listNotes: jest.fn(async () => {
        return Array.from(store.notes.keys()).map((id) => `${id}.md`);
      }),
      readNote: jest.fn(async (id: string) => {
        return store.notes.get(id) ?? null;
      }),
      writeNote: jest.fn(async (id: string, content: string) => {
        store.notes.set(id, content);
      }),
      deleteNote: jest.fn(async (id: string) => {
        store.notes.delete(id);
      }),
      readJsonFile: jest.fn(async (filename: string) => {
        return (store.json.get(filename) as unknown) ?? null;
      }),
      writeJsonFile: jest.fn(async (filename: string, data: unknown) => {
        store.json.set(filename, data);
      }),
      ensureDataDir: jest.fn().mockResolvedValue('/tmp/test-data'),
      getDataDir: jest.fn().mockResolvedValue('/tmp/test-data'),
      setDataDir: jest.fn().mockResolvedValue('/tmp/test-data'),
      selectDirectory: jest.fn().mockResolvedValue(null),
      watchStart: jest.fn().mockResolvedValue(undefined),
      watchStop: jest.fn().mockResolvedValue(undefined),
      onFileChanged: jest.fn((cb: (event: { type: string; filename: string; filePath: string }) => void) => {
        fileChangedCallbacks.push(cb);
      }),
      removeFileChangedListener: jest.fn(() => {
        fileChangedCallbacks.length = 0;
      }),
      onWatcherReady: jest.fn(),
      onWatcherError: jest.fn(),
      removeWatcherLifecycleListeners: jest.fn(),
    },
    // Test helper: simulate a file change event from chokidar
    _simulateFileChange: (type: 'add' | 'change' | 'unlink', filename: string) => {
      for (const cb of fileChangedCallbacks) {
        cb({ type, filename, filePath: `/tmp/test-data/notes/${filename}` });
      }
    },
  };
}

/**
 * Install the mock window.electron globally for database.ts to use.
 * Also sets up navigator.onLine for SyncManager.
 */
export function installMockElectron(store: MockNoteStore) {
  const mock = createMockElectron(store);
  (globalThis as Record<string, unknown>).window = {
    electron: mock,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  // Ensure navigator.onLine is available for SyncManager
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as Record<string, unknown>).navigator = { onLine: true };
  } else {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true, configurable: true });
  }
  return mock;
}

/**
 * Build a markdown note file with YAML frontmatter.
 */
export function buildNoteFile(opts: {
  id: string;
  content: string;
  categoryId?: string | null;
  status?: number;
  version?: number;
  isLocal?: boolean;
  serverId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): string {
  const now = new Date().toISOString();
  const lines = [
    '---',
    `id: "${opts.id}"`,
    `categoryId: ${opts.categoryId ? `"${opts.categoryId}"` : 'null'}`,
    `status: ${opts.status ?? 0}`,
    `version: ${opts.version ?? 1}`,
    `deviceId: ""`,
    `createdAt: "${opts.createdAt ?? now}"`,
    `updatedAt: "${opts.updatedAt ?? now}"`,
    `isLocal: ${opts.isLocal ?? true}`,
    `serverId: ${opts.serverId ? `"${opts.serverId}"` : 'null'}`,
    '---',
    opts.content,
  ];
  return lines.join('\n');
}
