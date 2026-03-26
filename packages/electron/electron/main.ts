import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import chokidar from 'chokidar';
import path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { settingsStore, AppSettings } from './settings';

let mainWindow: BrowserWindow | null = null;
let quickCaptureWindow: BrowserWindow | null = null;
let quickCaptureCodeWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// File system storage
let watcher: ReturnType<typeof chokidar.watch> | null = null;

function getDataDir(): string {
  const customDir = settingsStore.store.dataDirectory;
  return customDir || path.join(app.getPath('userData'), 'data');
}

function getNotesDir(): string {
  return path.join(getDataDir(), 'notes');
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

  const notify = (type: 'add' | 'change' | 'unlink', filePath: string) => {
    const filename = path.basename(filePath);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('fs:file-changed', { type, filename });
    });
  };

  watcher = chokidar.watch(path.join(notesDir, '*.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    usePolling: false,
  });

  watcher
    .on('add', (filePath: string) => notify('add', filePath))
    .on('change', (filePath: string) => notify('change', filePath))
    .on('unlink', (filePath: string) => notify('unlink', filePath))
    .on('error', (error: unknown) => console.error('File watcher error:', error));
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

function createTray() {
  // Create a tray icon with the app's accent color (indigo)
  const size = 16;
  const bytesPerPixel = 4; // RGBA
  const buffer = Buffer.alloc(size * size * bytesPerPixel);

  // Create a rounded square with Flashpad's indigo color (#6366f1)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * bytesPerPixel;

      // Create rounded corners effect
      const cornerRadius = 3;
      const isCorner = (
        (x < cornerRadius && y < cornerRadius && (cornerRadius - x) + (cornerRadius - y) > cornerRadius) ||
        (x >= size - cornerRadius && y < cornerRadius && (x - (size - cornerRadius - 1)) + (cornerRadius - y) > cornerRadius) ||
        (x < cornerRadius && y >= size - cornerRadius && (cornerRadius - x) + (y - (size - cornerRadius - 1)) > cornerRadius) ||
        (x >= size - cornerRadius && y >= size - cornerRadius && (x - (size - cornerRadius - 1)) + (y - (size - cornerRadius - 1)) > cornerRadius)
      );

      if (isCorner) {
        // Transparent corner
        buffer[i] = 0;
        buffer[i + 1] = 0;
        buffer[i + 2] = 0;
        buffer[i + 3] = 0;
      } else {
        // Indigo color (#6366f1)
        buffer[i] = 99;   // R
        buffer[i + 1] = 102; // G
        buffer[i + 2] = 241; // B
        buffer[i + 3] = 255; // A
      }
    }
  }

  const icon = nativeImage.createFromBitmap(buffer, {
    width: size,
    height: size,
  });
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
        autoUpdater.checkForUpdatesAndNotify();
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
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    console.log('Update available');
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded');
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded');
    }
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
  autoUpdater.checkForUpdatesAndNotify();
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

ipcMain.handle('get-auth-token', () => {
  if (mainWindow) {
    return mainWindow.webContents.executeJavaScript('localStorage.getItem("token")');
  }
  return null;
});

ipcMain.handle('note-created-from-quick-capture', () => {
  if (mainWindow) {
    mainWindow.webContents.send('refresh-notes');
  }
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
    const notesDir = getNotesDir();
    const filePath = path.join(notesDir, `${id}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch {
    return null;
  }
});

ipcMain.handle('fs:write-note', async (_event, id: string, content: string) => {
  await ensureDataDirectories();
  const notesDir = getNotesDir();
  const filePath = path.join(notesDir, `${id}.md`);
  await fs.writeFile(filePath, content, 'utf-8');
});

ipcMain.handle('fs:delete-note', async (_event, id: string) => {
  try {
    const notesDir = getNotesDir();
    const filePath = path.join(notesDir, `${id}.md`);
    await fs.unlink(filePath);
  } catch {
    // File may not exist, ignore error
  }
});

ipcMain.handle('fs:read-json', async (_event, filename: string) => {
  try {
    const dataDir = getDataDir();
    const filePath = path.join(dataDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
});

ipcMain.handle('fs:write-json', async (_event, filename: string, data: unknown) => {
  await ensureDataDirectories();
  const dataDir = getDataDir();
  const filePath = path.join(dataDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
