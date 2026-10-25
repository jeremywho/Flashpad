import { APP_USER_MODEL_ID, planShortcutRepairs } from '../windowsShortcuts';
import packageJson from '../../../package.json';

const EXE = 'C:\\Users\\Jeremy\\AppData\\Local\\Programs\\@flashpadelectron\\Flashpad.exe';

describe('APP_USER_MODEL_ID', () => {
  it('matches the appId the installer stamps on its shortcuts', () => {
    expect(APP_USER_MODEL_ID).toBe(packageJson.build.appId);
  });
});

describe('planShortcutRepairs', () => {
  it('repairs a pin that carries Electron\'s default id and no icon', () => {
    const repairs = planShortcutRepairs(
      [{ path: 'TaskBar\\Flashpad (2).lnk', target: EXE, appUserModelId: 'electron.app.Flashpad', icon: '' }],
      EXE
    );
    expect(repairs).toEqual([
      { path: 'TaskBar\\Flashpad (2).lnk', appUserModelId: APP_USER_MODEL_ID, icon: EXE, iconIndex: 0 },
    ]);
  });

  it('repairs a missing icon even when the id is already right', () => {
    const repairs = planShortcutRepairs(
      [{ path: 'Start Menu\\Flashpad.lnk', target: EXE, appUserModelId: APP_USER_MODEL_ID, icon: '' }],
      EXE
    );
    expect(repairs.map((r) => r.path)).toEqual(['Start Menu\\Flashpad.lnk']);
  });

  it('leaves correct shortcuts alone, matching paths case- and slash-insensitively', () => {
    const repairs = planShortcutRepairs(
      [{ path: 'Desktop\\Flashpad.lnk', target: EXE.toLowerCase().replace(/\\/g, '/'), appUserModelId: APP_USER_MODEL_ID, icon: EXE.toUpperCase() }],
      EXE
    );
    expect(repairs).toEqual([]);
  });

  it('never touches shortcuts that point at another program', () => {
    const repairs = planShortcutRepairs(
      [
        { path: 'TaskBar\\Notepad.lnk', target: 'C:\\Windows\\notepad.exe', appUserModelId: 'x' },
        { path: 'TaskBar\\Old Flashpad.lnk', target: `${EXE}.old`, appUserModelId: 'electron.app.Flashpad' },
        { path: 'TaskBar\\Other.lnk', target: 'C:\\Other\\Flashpad.exe', appUserModelId: 'electron.app.Flashpad' },
      ],
      EXE
    );
    expect(repairs).toEqual([]);
  });
});
