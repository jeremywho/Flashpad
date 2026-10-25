// Must equal build.appId in package.json: the NSIS installer stamps every shortcut
// it creates with that id, and Windows groups a running window under the pinned
// shortcut whose id matches the process's AppUserModelID.
export const APP_USER_MODEL_ID = 'com.flashpad.app';

export interface ShortcutInfo {
  path: string;
  target: string;
  appUserModelId?: string;
  icon?: string;
}

export interface ShortcutRepair {
  path: string;
  appUserModelId: string;
  icon: string;
  iconIndex: number;
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();
}

export function planShortcutRepairs(
  shortcuts: ShortcutInfo[],
  execPath: string,
  appUserModelId: string = APP_USER_MODEL_ID
): ShortcutRepair[] {
  return shortcuts
    .filter((shortcut) => samePath(shortcut.target, execPath))
    .filter((shortcut) => shortcut.appUserModelId !== appUserModelId || !shortcut.icon || !samePath(shortcut.icon, execPath))
    .map((shortcut) => ({ path: shortcut.path, appUserModelId, icon: execPath, iconIndex: 0 }));
}
