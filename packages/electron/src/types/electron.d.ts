export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  quickCaptureCodeHotkey: string;
  theme: 'dark' | 'light' | 'system';
  dataDirectory: string | null;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filename: string;
  filePath: string;
}

export interface WatcherReadyEvent {
  notesDir: string;
}

export interface WatcherErrorEvent {
  error: string;
}

export interface ElectronFsAPI {
  // Notes directory operations
  listNotes: () => Promise<string[]>;
  readNote: (id: string) => Promise<string | null>;
  writeNote: (id: string, content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  // JSON file operations (categories, sync-queue, device-info)
  readJsonFile: <T>(filename: string) => Promise<T | null>;
  writeJsonFile: (filename: string, data: unknown) => Promise<void>;

  // Directory management
  ensureDataDir: () => Promise<string>;
  getDataDir: () => Promise<string>;
  setDataDir: (path: string | null) => Promise<string>;
  selectDirectory: () => Promise<string | null>;

  // File watching
  watchStart: () => Promise<void>;
  watchStop: () => Promise<void>;
  onFileChanged: (callback: (event: FileChangeEvent) => void) => void;
  removeFileChangedListener: () => void;
  onWatcherReady: (callback: (event: WatcherReadyEvent) => void) => void;
  onWatcherError: (callback: (event: WatcherErrorEvent) => void) => void;
  removeWatcherLifecycleListeners: () => void;
}

export interface ElectronAPI {
  onUpdateDownloaded: (callback: () => void) => void;
  removeUpdateListener: () => void;
  onRefreshNotes: (callback: () => void) => void;
  removeRefreshNotesListener: () => void;
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    reset: () => Promise<AppSettings>;
  };
  app: {
    apiBaseUrl: string;
    getVersion: () => Promise<string>;
    checkForUpdates: () => Promise<void>;
  };
  auth: {
    setSessionActive: (isActive: boolean) => Promise<void>;
  };
  quickCapture: {
    close: () => Promise<void>;
    isAuthenticated: () => Promise<boolean>;
    createNote: (payload: { content: string; deviceId?: string }) => Promise<{ noteId: string }>;
    notifyNoteCreated: () => Promise<void>;
  };
  quickCaptureCode: {
    close: () => Promise<void>;
  };
  fs: ElectronFsAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
