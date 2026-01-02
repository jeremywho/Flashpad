/// <reference types="vite/client" />

interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
}

interface Window {
  electron?: {
    onUpdateDownloaded: (callback: () => void) => void;
    removeUpdateListener: () => void;
    settings: {
      get: () => Promise<AppSettings>;
      set: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      reset: () => Promise<AppSettings>;
    };
  };
}
