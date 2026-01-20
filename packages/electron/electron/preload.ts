import { contextBridge, ipcRenderer } from 'electron';

export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  theme: 'dark' | 'light' | 'system';
  dataDirectory: string | null;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filename: string;
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
    getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  },
  quickCapture: {
    close: (): Promise<void> => ipcRenderer.invoke('close-quick-capture'),
    getAuthToken: (): Promise<string | null> => ipcRenderer.invoke('get-auth-token'),
    notifyNoteCreated: (): Promise<void> => ipcRenderer.invoke('note-created-from-quick-capture'),
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
  },
});
