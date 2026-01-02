import Store from 'electron-store';

export interface AppSettings {
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureHotkey: string;
  theme: 'dark' | 'light' | 'system';
}

export const defaultSettings: AppSettings = {
  minimizeToTray: true,
  startMinimized: false,
  closeToTray: true,
  quickCaptureHotkey: 'CommandOrControl+Alt+N',
  theme: 'dark',
};

export const settingsStore = new Store<AppSettings>({
  defaults: defaultSettings,
  name: 'app-settings',
});
