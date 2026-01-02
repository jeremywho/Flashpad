import { contextBridge, ipcRenderer } from 'electron';

export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  theme: 'dark' | 'light' | 'system';
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
  quickCapture: {
    close: (): Promise<void> => ipcRenderer.invoke('close-quick-capture'),
    getAuthToken: (): Promise<string | null> => ipcRenderer.invoke('get-auth-token'),
    notifyNoteCreated: (): Promise<void> => ipcRenderer.invoke('note-created-from-quick-capture'),
  },
});
