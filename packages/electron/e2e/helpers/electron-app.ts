import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface AppInstance {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  deviceId: string;
  /** Stop the app and clean up temp data dir */
  stop: () => Promise<void>;
}

/**
 * Launch an Electron app instance with an isolated data directory.
 * Each instance acts as an independent device.
 */
export async function launchApp(opts: {
  apiUrl: string;
  deviceId?: string;
}): Promise<AppInstance> {
  const deviceId = opts.deviceId ?? `e2e-device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `flashpad-e2e-data-${deviceId}-`));
  const notesDir = path.join(dataDir, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });

  // Navigate from packages/electron/e2e/helpers/ to packages/electron/dist-electron/
  const electronRoot = path.resolve(__dirname, '../..');
  const mainPath = path.resolve(electronRoot, 'dist-electron/main.js');

  // Use a separate Electron user data dir so localStorage/auth state is isolated
  const userDataDir = path.join(dataDir, 'electron-userdata');
  fs.mkdirSync(userDataDir, { recursive: true });

  const app = await electron.launch({
    args: [mainPath, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      // Override API URL for the Electron app
      VITE_API_URL: opts.apiUrl,
      // Override the data directory via electron-store
      FLASHPAD_DATA_DIR: dataDir,
      // Disable auto-updates in tests
      ELECTRON_DISABLE_UPDATES: '1',
      // Unique device ID
      FLASHPAD_DEVICE_ID: deviceId,
    },
  });

  const page = await app.firstWindow();

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    dataDir,
    deviceId,
    stop: async () => {
      // The app defaults to closeToTray=true, so app.close() just hides the window.
      // We must force-kill the entire process tree to ensure full cleanup.
      const pid = app.process().pid;
      try {
        // Kill the entire process tree (macOS: use process group)
        if (pid) {
          const { execSync } = require('child_process');
          try {
            execSync(`kill -9 -${pid} 2>/dev/null || kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore' });
          } catch {
            // Process may already be dead
          }
        }
        await app.close().catch(() => {});
      } catch {
        // Already dead
      }
      // Wait for process cleanup
      await new Promise((r) => setTimeout(r, 1000));
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

/**
 * Login to the app via the UI, or skip if already authenticated.
 */
export async function loginViaUi(page: Page, username: string, password: string): Promise<void> {
  // Check if we're already on the home page (sidebar visible)
  const sidebar = page.locator('aside.sidebar');
  const loginField = page.locator('#username');

  // Wait for either to appear
  await page.waitForTimeout(2000);

  if (await sidebar.isVisible()) {
    // Already logged in
    return;
  }

  // Wait for login form
  await loginField.waitFor({ state: 'visible', timeout: 10_000 });

  await loginField.fill(username);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for the sidebar to appear after login
  await sidebar.waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Create a note via the UI.
 */
export async function createNoteViaUi(page: Page, content: string): Promise<void> {
  // Click the "New Note" button
  await page.click('button:has-text("New"), button[title*="new"]');

  // Wait for editor to be ready
  await page.waitForSelector('textarea, [contenteditable]', { timeout: 5_000 });

  // Type content
  const editor = page.locator('textarea, [contenteditable]').first();
  await editor.fill(content);

  // Save (Ctrl+Enter or click Save)
  await page.keyboard.press('Control+Enter');

  // Wait a moment for sync
  await page.waitForTimeout(1000);
}

/**
 * Get the list of visible note contents from the notes list.
 */
export async function getVisibleNotes(page: Page): Promise<string[]> {
  // Wait for notes to load
  await page.waitForTimeout(500);
  const noteElements = page.locator('.note-item, .notes-list-item, [class*="note-item"]');
  const count = await noteElements.count();
  const contents: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await noteElements.nth(i).textContent();
    if (text) contents.push(text.trim());
  }
  return contents;
}

/**
 * Write a note file directly to the app's data directory.
 * Simulates an external process dropping a file.
 */
export function dropNoteFile(
  dataDir: string,
  filename: string,
  content: string
): void {
  const notesDir = path.join(dataDir, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  fs.writeFileSync(path.join(notesDir, filename), content, 'utf-8');
}

/**
 * Delete a note file from the app's data directory.
 * Simulates an external process deleting a file.
 */
export function deleteNoteFile(dataDir: string, filename: string): void {
  const filePath = path.join(dataDir, 'notes', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * List note files in the app's data directory.
 */
export function listNoteFiles(dataDir: string): string[] {
  const notesDir = path.join(dataDir, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir).filter((f) => f.endsWith('.md'));
}

/**
 * Read a note file from the app's data directory.
 */
export function readNoteFile(dataDir: string, filename: string): string {
  return fs.readFileSync(path.join(dataDir, 'notes', filename), 'utf-8');
}
