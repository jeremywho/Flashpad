import type { UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater';

export interface UpdaterLike {
  on(event: 'checking-for-update', listener: () => void): UpdaterLike;
  on(event: 'update-available', listener: (info: UpdateInfo) => void): UpdaterLike;
  on(event: 'update-not-available', listener: (info: UpdateInfo) => void): UpdaterLike;
  on(event: 'download-progress', listener: (progress: ProgressInfo) => void): UpdaterLike;
  on(event: 'error', listener: (err: Error) => void): UpdaterLike;
  on(event: 'update-downloaded', listener: (info: UpdateDownloadedEvent) => void): UpdaterLike;
  checkForUpdatesAndNotify(): Promise<unknown> | void;
}

export interface UpdaterLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface UpdaterHandlers {
  onUpdateDownloaded: (info: UpdateDownloadedEvent) => void;
}

let listenersRegistered = false;

export function ensureUpdaterListeners(
  updater: UpdaterLike,
  logger: UpdaterLogger,
  handlers: UpdaterHandlers
): void {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;

  updater.on('checking-for-update', () => {
    logger.info('[updater] Checking for update...');
  });

  updater.on('update-available', (info) => {
    logger.info('[updater] Update available:', info.version);
  });

  updater.on('update-not-available', (info) => {
    logger.info('[updater] No update available. Current version is up to date:', info.version);
  });

  updater.on('download-progress', (progress) => {
    logger.info(`[updater] Download progress: ${Math.round(progress.percent)}%`);
  });

  updater.on('error', (err) => {
    logger.error('[updater] Error:', err.message);
  });

  updater.on('update-downloaded', (info) => {
    handlers.onUpdateDownloaded(info);
  });
}

export async function checkForUpdates(
  updater: UpdaterLike,
  logger: UpdaterLogger,
  handlers: UpdaterHandlers
): Promise<void> {
  ensureUpdaterListeners(updater, logger, handlers);
  await updater.checkForUpdatesAndNotify();
}

export function resetUpdaterListenersForTesting(): void {
  listenersRegistered = false;
}
