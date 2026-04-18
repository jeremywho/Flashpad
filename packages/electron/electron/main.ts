import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import chokidar from 'chokidar';
import path from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { settingsStore, AppSettings } from './settings';
import { checkForUpdates as requestUpdateCheck } from '../src/services/updater-listeners';

let mainWindow: BrowserWindow | null = null;
let quickCaptureWindow: BrowserWindow | null = null;
let quickCaptureCodeWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let quickCaptureSessionActive = false;

const NOTE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ALLOWED_DATA_FILES = new Set(['categories.json', 'sync-queue.json', 'device-info.json']);
const DEFAULT_QUICK_CAPTURE_DEVICE_ID = 'electron-desktop';

// File system storage
let watcher: ReturnType<typeof chokidar.watch> | null = null;

function getDataDir(): string {
  // Environment variable override for E2E testing (isolated data directories)
  const envOverride = process.env.FLASHPAD_DATA_DIR?.trim();
  if (envOverride) return path.resolve(envOverride);

  const customDir = settingsStore.store.dataDirectory;
  return customDir || path.join(app.getPath('userData'), 'data');
}

function getNotesDir(): string {
  return path.join(getDataDir(), 'notes');
}

function isValidNoteId(noteId: string): boolean {
  return NOTE_ID_REGEX.test(noteId);
}

function resolvePathWithinBaseDir(baseDir: string, relativePath: string): string | null {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const relative = path.relative(baseDir, resolvedPath);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedPath;
  }

  return null;
}

function isAllowedDataFilename(filename: string): boolean {
  return ALLOWED_DATA_FILES.has(filename);
}

function generateLocalNoteId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function serializeLocalNoteFile(note: {
  id: string;
  content: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}): string {
  const yaml = [
    `id: "${escapeYamlString(note.id)}"`,
    'categoryId: null',
    'status: 0',
    'version: 1',
    `deviceId: "${escapeYamlString(note.deviceId)}"`,
    `createdAt: "${escapeYamlString(note.createdAt)}"`,
    `updatedAt: "${escapeYamlString(note.updatedAt)}"`,
    'isLocal: true',
    'serverId: null',
  ].join('\n');

  return `---\n${yaml}\n---\n${note.content}`;
}

interface SyncQueueItem {
  id: number;
  entityType: 'note' | 'category';
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'RESTORE' | 'TRASH' | 'MOVE';
  payload: string;
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

interface SyncQueueFile {
  items: SyncQueueItem[];
  nextId: number;
}

async function readDataJsonFile<T>(filename: string): Promise<T | null> {
  if (!isAllowedDataFilename(filename)) {
    throw new Error(`Unsafe data filename: ${filename}`);
  }

  const dataDir = getDataDir();
  const filePath = resolvePathWithinBaseDir(dataDir, filename);
  if (!filePath) {
    return null;
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeDataJsonFile(filename: string, data: unknown): Promise<void> {
  if (!isAllowedDataFilename(filename)) {
    throw new Error(`Unsafe data filename: ${filename}`);
  }

  await ensureDataDirectories();
  const dataDir = getDataDir();
  const filePath = resolvePathWithinBaseDir(dataDir, filename);
  if (!filePath) {
    throw new Error(`Unsafe data path: ${filename}`);
  }

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function queueQuickCaptureNote(content: string, deviceId?: string): Promise<{ noteId: string }> {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error('Note content is required');
  }

  await ensureDataDirectories();

  const noteId = generateLocalNoteId();
  const timestamp = new Date().toISOString();
  const resolvedDeviceId = (deviceId?.trim() || DEFAULT_QUICK_CAPTURE_DEVICE_ID);
  const noteFilePath = resolvePathWithinBaseDir(getNotesDir(), `${noteId}.md`);

  if (!noteFilePath) {
    throw new Error(`Unsafe note path: ${noteId}`);
  }

  await fs.writeFile(
    noteFilePath,
    serializeLocalNoteFile({
      id: noteId,
      content: trimmedContent,
      deviceId: resolvedDeviceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    'utf-8'
  );

  const existingQueue = (await readDataJsonFile<SyncQueueFile>('sync-queue.json')) ?? {
    items: [],
    nextId: 1,
  };
  const items = Array.isArray(existingQueue.items) ? [...existingQueue.items] : [];
  const nextId =
    typeof existingQueue.nextId === 'number' && existingQueue.nextId > 0
      ? existingQueue.nextId
      : (items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1);

  items.push({
    id: nextId,
    entityType: 'note',
    entityId: noteId,
    operation: 'CREATE',
    payload: JSON.stringify({
      content: trimmedContent,
      deviceId: resolvedDeviceId,
    }),
    baseVersion: null,
    createdAt: timestamp,
    retryCount: 0,
    lastError: null,
  });

  await writeDataJsonFile('sync-queue.json', {
    items,
    nextId: nextId + 1,
  });

  if (mainWindow) {
    mainWindow.webContents.send('refresh-notes');
  }

  return { noteId };
}

function getAllowedWindowBaseUrl(): URL {
  if (process.env.VITE_DEV_SERVER_URL) {
    return new URL(process.env.VITE_DEV_SERVER_URL);
  }

  return pathToFileURL(path.join(__dirname, '../dist/index.html'));
}

function isAllowedWindowNavigation(targetUrl: string, allowedBaseUrl: URL): boolean {
  try {
    const parsedUrl = new URL(targetUrl);

    if (allowedBaseUrl.protocol === 'file:') {
      return (
        parsedUrl.protocol === 'file:' &&
        parsedUrl.host === allowedBaseUrl.host &&
        parsedUrl.pathname === allowedBaseUrl.pathname
      );
    }

    return parsedUrl.origin === allowedBaseUrl.origin;
  } catch {
    return false;
  }
}

function isExternalWebUrl(targetUrl: string): boolean {
  try {
    const parsedUrl = new URL(targetUrl);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function attachWindowSecurityGuards(window: BrowserWindow): void {
  const allowedBaseUrl = getAllowedWindowBaseUrl();
  const { webContents } = window;

  webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedWindowNavigation(targetUrl, allowedBaseUrl)) {
      return;
    }

    event.preventDefault();
    if (isExternalWebUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedWindowNavigation(url, allowedBaseUrl)) {
      return { action: 'allow' };
    }

    if (isExternalWebUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });
}

async function ensureDataDirectories(): Promise<void> {
  const dataDir = getDataDir();
  const notesDir = getNotesDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(notesDir, { recursive: true });
}

function startFileWatcher(): void {
  stopFileWatcher();
  const notesDir = getNotesDir();

  // Ensure directory exists before watching
  if (!fsSync.existsSync(notesDir)) {
    fsSync.mkdirSync(notesDir, { recursive: true });
  }

  // Recursive FSEvents is more reliable than depth:0 for writes from external
  // processes on macOS. Filter to .md files in the event handlers.
  watcher = chokidar.watch(notesDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    usePolling: false,
  });

  const notifyIfMd = (type: 'add' | 'change' | 'unlink', filePath: string) => {
    const filename = path.basename(filePath);
    const isMd = filePath.endsWith('.md');
    console.log('[watcher]', type, filePath, isMd ? '→ forwarded' : '(ignored, not .md)');
    if (!isMd) return;
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('fs:file-changed', { type, filename, filePath });
    });
  };

  watcher
    .on('add', (filePath: string) => notifyIfMd('add', filePath))
    .on('change', (filePath: string) => notifyIfMd('change', filePath))
    .on('unlink', (filePath: string) => notifyIfMd('unlink', filePath))
    .on('ready', () => {
      console.log('[watcher] ready, watching', notesDir);
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('fs:watcher-ready', { notesDir });
      });
    })
    .on('error', (error: unknown) => {
      console.error('[watcher] error:', error);
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('fs:watcher-error', { error: String(error) });
      });
    });
}

function stopFileWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

// Auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = {
  info: (msg: unknown) => console.log('[updater]', msg),
  warn: (msg: unknown) => console.warn('[updater]', msg),
  error: (msg: unknown) => console.error('[updater]', msg),
  debug: (msg: unknown) => console.log('[updater:debug]', msg),
};

function createTray() {
  // Load the app icon for the system tray
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'resources', 'icon.png');

  let icon = nativeImage.createFromPath(iconPath);

  // Resize for tray: 16x16 on Windows/Linux, 18x18 on macOS (rendered at 2x for Retina)
  const traySize = process.platform === 'darwin' ? 18 : 16;
  icon = icon.resize({ width: traySize, height: traySize });

  tray = new Tray(icon);

  const version = app.getVersion();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quick Capture',
      accelerator: settingsStore.store.quickCaptureHotkey,
      click: () => {
        createQuickCaptureWindow();
      },
    },
    {
      label: 'Quick Code Snippet',
      accelerator: settingsStore.store.quickCaptureCodeHotkey,
      click: () => {
        createQuickCaptureCodeWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Check for Updates (v${version})`,
      click: () => {
        checkForUpdates();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Flashpad');
  tray.setContextMenu(contextMenu);

  // Single click to show/hide on Windows, double click on macOS
  tray.on('click', () => {
    if (process.platform === 'win32') {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createWindow();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function createWindow() {
  // Prevent creating multiple main windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const settings = settingsStore.store;
  const saved = settings.windowBounds;

  mainWindow = new BrowserWindow({
    width: saved?.width || 1200,
    height: saved?.height || 800,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    show: !settings.startMinimized,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachWindowSecurityGuards(mainWindow);

  if (saved?.maximized) {
    mainWindow.maximize();
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in a separate window
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Save window bounds when resized or moved
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    if (!maximized) {
      const bounds = mainWindow.getBounds();
      settingsStore.set('windowBounds', { ...bounds, maximized: false });
    } else {
      settingsStore.set('windowBounds', { ...settingsStore.store.windowBounds!, maximized: true });
    }
  };

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Handle window close event based on user settings
  mainWindow.on('close', (event) => {
    saveBounds();
    const settings = settingsStore.store;

    if (settings.closeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates after window is created (production only)
  if (!process.env.VITE_DEV_SERVER_URL) {
    checkForUpdates();
  }
}

function createQuickCaptureWindow() {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.show();
    quickCaptureWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  quickCaptureWindow = new BrowserWindow({
    width: 500,
    height: 200,
    x: Math.round((width - 500) / 2),
    y: Math.round(height * 0.2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachWindowSecurityGuards(quickCaptureWindow);

  const quickCaptureUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}#/quick-capture`
    : `file://${path.join(__dirname, '../dist/index.html')}#/quick-capture`;

  quickCaptureWindow.loadURL(quickCaptureUrl);

  quickCaptureWindow.once('ready-to-show', () => {
    quickCaptureWindow?.show();
    quickCaptureWindow?.focus();
  });

  quickCaptureWindow.on('blur', () => {
    quickCaptureWindow?.hide();
  });

  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null;
  });
}

function createQuickCaptureCodeWindow() {
  if (quickCaptureCodeWindow && !quickCaptureCodeWindow.isDestroyed()) {
    quickCaptureCodeWindow.show();
    quickCaptureCodeWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  quickCaptureCodeWindow = new BrowserWindow({
    width: 600,
    height: 350,
    x: Math.round((width - 600) / 2),
    y: Math.round(height * 0.15),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachWindowSecurityGuards(quickCaptureCodeWindow);

  const quickCaptureCodeUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}#/quick-capture-code`
    : `file://${path.join(__dirname, '../dist/index.html')}#/quick-capture-code`;

  quickCaptureCodeWindow.loadURL(quickCaptureCodeUrl);

  quickCaptureCodeWindow.once('ready-to-show', () => {
    quickCaptureCodeWindow?.show();
    quickCaptureCodeWindow?.focus();
  });

  quickCaptureCodeWindow.on('blur', () => {
    quickCaptureCodeWindow?.hide();
  });

  quickCaptureCodeWindow.on('closed', () => {
    quickCaptureCodeWindow = null;
  });
}

function registerGlobalShortcut() {
  const settings = settingsStore.store;

  globalShortcut.unregisterAll();

  const registered = globalShortcut.register(settings.quickCaptureHotkey, () => {
    createQuickCaptureWindow();
  });

  if (!registered) {
    console.error('Failed to register global shortcut:', settings.quickCaptureHotkey);
  }

  const registeredCode = globalShortcut.register(settings.quickCaptureCodeHotkey, () => {
    createQuickCaptureCodeWindow();
  });

  if (!registeredCode) {
    console.error('Failed to register global shortcut:', settings.quickCaptureCodeHotkey);
  }
}

function checkForUpdates() {
  void requestUpdateCheck(autoUpdater, console, {
    onUpdateDownloaded: (info) => {
      console.log('[updater] Update downloaded:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded');
      }
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    },
  });
}

// IPC handlers for settings management
ipcMain.handle('get-settings', () => {
  return settingsStore.store;
});

ipcMain.handle('set-settings', (_event, settings: Partial<AppSettings>) => {
  const oldHotkey = settingsStore.store.quickCaptureHotkey;
  const oldCodeHotkey = settingsStore.store.quickCaptureCodeHotkey;
  Object.assign(settingsStore.store, settings);

  // Re-register global shortcuts if hotkeys changed
  if (
    (settings.quickCaptureHotkey && settings.quickCaptureHotkey !== oldHotkey) ||
    (settings.quickCaptureCodeHotkey && settings.quickCaptureCodeHotkey !== oldCodeHotkey)
  ) {
    registerGlobalShortcut();
  }

  return settingsStore.store;
});

ipcMain.handle('reset-settings', () => {
  settingsStore.clear();
  return settingsStore.store;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', () => {
  checkForUpdates();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Quick capture IPC handlers
ipcMain.handle('close-quick-capture', () => {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.hide();
  }
});

ipcMain.handle('close-quick-capture-code', () => {
  if (quickCaptureCodeWindow && !quickCaptureCodeWindow.isDestroyed()) {
    quickCaptureCodeWindow.hide();
  }
});

ipcMain.handle('auth:set-session-active', (_event, isActive: boolean) => {
  quickCaptureSessionActive = isActive;
});

ipcMain.handle('note-created-from-quick-capture', () => {
  if (mainWindow) {
    mainWindow.webContents.send('refresh-notes');
  }
});

ipcMain.handle('quick-capture:is-authenticated', () => {
  return quickCaptureSessionActive;
});

ipcMain.handle('quick-capture:create-note', async (_event, payload: { content: string; deviceId?: string }) => {
  if (!quickCaptureSessionActive) {
    throw new Error('Please log in to the main app first');
  }

  return queueQuickCaptureNote(payload.content, payload.deviceId);
});

// File system IPC handlers
ipcMain.handle('fs:ensure-data-dir', async () => {
  await ensureDataDirectories();
  return getDataDir();
});

ipcMain.handle('fs:get-data-dir', () => {
  return getDataDir();
});

ipcMain.handle('fs:set-data-dir', async (_event, newPath: string | null) => {
  settingsStore.set('dataDirectory', newPath);
  await ensureDataDirectories();
  // Restart file watcher for new directory
  startFileWatcher();
  return getDataDir();
});

ipcMain.handle('fs:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Notes Directory',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('fs:list-notes', async () => {
  try {
    await ensureDataDirectories();
    const notesDir = getNotesDir();
    const files = await fs.readdir(notesDir);
    return files.filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
});

ipcMain.handle('fs:read-note', async (_event, id: string) => {
  try {
    if (!isValidNoteId(id)) {
      return null;
    }

    const notesDir = getNotesDir();
    const filePath = resolvePathWithinBaseDir(notesDir, `${id}.md`);
    if (!filePath) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch {
    return null;
  }
});

ipcMain.handle('fs:write-note', async (_event, id: string, content: string) => {
  if (!isValidNoteId(id)) {
    throw new Error(`Unsafe note ID: ${id}`);
  }

  await ensureDataDirectories();
  const notesDir = getNotesDir();
  const filePath = resolvePathWithinBaseDir(notesDir, `${id}.md`);
  if (!filePath) {
    throw new Error(`Unsafe note path: ${id}`);
  }

  await fs.writeFile(filePath, content, 'utf-8');
});

ipcMain.handle('fs:delete-note', async (_event, id: string) => {
  try {
    if (!isValidNoteId(id)) {
      return;
    }

    const notesDir = getNotesDir();
    const filePath = resolvePathWithinBaseDir(notesDir, `${id}.md`);
    if (!filePath) {
      return;
    }

    await fs.unlink(filePath);
  } catch {
    // File may not exist, ignore error
  }
});

ipcMain.handle('fs:read-json', async (_event, filename: string) => {
  try {
    return await readDataJsonFile(filename);
  } catch {
    return null;
  }
});

ipcMain.handle('fs:write-json', async (_event, filename: string, data: unknown) => {
  await writeDataJsonFile(filename, data);
});

ipcMain.handle('fs:watch-start', () => {
  startFileWatcher();
});

ipcMain.handle('fs:watch-stop', () => {
  stopFileWatcher();
});

ipcMain.handle('fs:check-migration-needed', async () => {
  // Check if old localStorage database marker exists
  // This will be sent from renderer since localStorage is renderer-side
  return true;
});

app.whenReady().then(() => {
  createTray();
  createWindow();
  registerGlobalShortcut();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  const settings = settingsStore.store;

  // If closeToTray is enabled, don't quit when all windows are closed
  if (!settings.closeToTray && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopFileWatcher();
});
