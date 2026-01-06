import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { settingsStore, AppSettings } from './settings';

let mainWindow: BrowserWindow | null = null;
let quickCaptureWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quick Capture',
      accelerator: settingsStore.store.quickCaptureHotkey,
      click: () => {
        createQuickCaptureWindow();
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

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: !settings.startMinimized, // Don't show window if startMinimized is true
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in a separate window
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window close event based on user settings
  mainWindow.on('close', (event) => {
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

function registerGlobalShortcut() {
  const settings = settingsStore.store;

  globalShortcut.unregisterAll();

  const registered = globalShortcut.register(settings.quickCaptureHotkey, () => {
    createQuickCaptureWindow();
  });

  if (!registered) {
    console.error('Failed to register global shortcut:', settings.quickCaptureHotkey);
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
  Object.assign(settingsStore.store, settings);

  // Re-register global shortcut if hotkey changed
  if (settings.quickCaptureHotkey && settings.quickCaptureHotkey !== oldHotkey) {
    registerGlobalShortcut();
  }

  return settingsStore.store;
});

ipcMain.handle('reset-settings', () => {
  settingsStore.clear();
  return settingsStore.store;
});

// Quick capture IPC handlers
ipcMain.handle('close-quick-capture', () => {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.hide();
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
});
