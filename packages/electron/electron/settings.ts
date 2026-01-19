import Store from 'electron-store';

export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  theme: 'dark' | 'light' | 'system';
  dataDirectory: string | null; // null means use default (app.getPath('userData')/data)
}

export const defaultSettings: AppSettings = {
  minimizeToTray: true,
  startMinimized: false,
  closeToTray: true,
  quickCaptureHotkey: 'CommandOrControl+Alt+N',
  theme: 'dark',
  dataDirectory: null,
};

export const settingsStore = new Store<AppSettings>({
  defaults: defaultSettings,
  name: 'app-settings',
});
