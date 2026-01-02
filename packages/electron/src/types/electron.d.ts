export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  theme: 'dark' | 'light' | 'system';
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
  quickCapture: {
    close: () => Promise<void>;
    getAuthToken: () => Promise<string | null>;
    notifyNoteCreated: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
