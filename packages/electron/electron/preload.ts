import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('electron', {
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('update-downloaded', callback);
  },
  removeUpdateListener: () => {
    ipcRenderer.removeAllListeners('update-downloaded');
  },
  onRefreshNotes: (callback: () => void) => {
    ipcRenderer.on('refresh-notes', callback);
  },
  removeRefreshNotesListener: () => {
    ipcRenderer.removeAllListeners('refresh-notes');
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
    set: (settings: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('set-settings', settings),
    reset: (): Promise<AppSettings> => ipcRenderer.invoke('reset-settings'),
  },
  app: {
    apiBaseUrl: process.env.VITE_API_URL || '',
    getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  },
  auth: {
    setSessionActive: (isActive: boolean): Promise<void> =>
      ipcRenderer.invoke('auth:set-session-active', isActive),
    getRefreshToken: (): Promise<string | null> =>
      ipcRenderer.invoke('auth:get-refresh-token'),
    setRefreshToken: (token: string): Promise<void> =>
      ipcRenderer.invoke('auth:set-refresh-token', token),
    clearRefreshToken: (): Promise<void> =>
      ipcRenderer.invoke('auth:clear-refresh-token'),
    isEncryptionAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('auth:is-encryption-available'),
  },
  quickCapture: {
    close: (): Promise<void> => ipcRenderer.invoke('close-quick-capture'),
    isAuthenticated: (): Promise<boolean> => ipcRenderer.invoke('quick-capture:is-authenticated'),
    createNote: (payload: { content: string; deviceId?: string }): Promise<{ noteId: string }> =>
      ipcRenderer.invoke('quick-capture:create-note', payload),
    notifyNoteCreated: (): Promise<void> => ipcRenderer.invoke('note-created-from-quick-capture'),
  },
  quickCaptureCode: {
    close: (): Promise<void> => ipcRenderer.invoke('close-quick-capture-code'),
  },
  fs: {
    // Notes directory operations
    listNotes: (): Promise<string[]> => ipcRenderer.invoke('fs:list-notes'),
    readNote: (id: string): Promise<string | null> => ipcRenderer.invoke('fs:read-note', id),
    writeNote: (id: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:write-note', id, content),
    deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('fs:delete-note', id),

    // JSON file operations (categories, sync-queue, device-info)
    readJsonFile: <T>(filename: string): Promise<T | null> =>
      ipcRenderer.invoke('fs:read-json', filename),
    writeJsonFile: (filename: string, data: unknown): Promise<void> =>
      ipcRenderer.invoke('fs:write-json', filename, data),

    // Directory management
    ensureDataDir: (): Promise<string> => ipcRenderer.invoke('fs:ensure-data-dir'),
    getDataDir: (): Promise<string> => ipcRenderer.invoke('fs:get-data-dir'),
    setDataDir: (path: string | null): Promise<string> =>
      ipcRenderer.invoke('fs:set-data-dir', path),
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('fs:select-directory'),

    // File watching
    watchStart: (): Promise<void> => ipcRenderer.invoke('fs:watch-start'),
    watchStop: (): Promise<void> => ipcRenderer.invoke('fs:watch-stop'),
    onFileChanged: (callback: (event: FileChangeEvent) => void): void => {
      ipcRenderer.on('fs:file-changed', (_event, data: FileChangeEvent) => callback(data));
    },
    removeFileChangedListener: (): void => {
      ipcRenderer.removeAllListeners('fs:file-changed');
    },
    onWatcherReady: (callback: (event: WatcherReadyEvent) => void): void => {
      ipcRenderer.on('fs:watcher-ready', (_event, data: WatcherReadyEvent) => callback(data));
    },
    onWatcherError: (callback: (event: WatcherErrorEvent) => void): void => {
      ipcRenderer.on('fs:watcher-error', (_event, data: WatcherErrorEvent) => callback(data));
    },
    removeWatcherLifecycleListeners: (): void => {
      ipcRenderer.removeAllListeners('fs:watcher-ready');
      ipcRenderer.removeAllListeners('fs:watcher-error');
    },
  },
});
