import { EventEmitter } from 'events';
import { checkForUpdates, resetUpdaterListenersForTesting, UpdaterLike } from '../updater-listeners';

class MockUpdater extends EventEmitter {
  checkForUpdatesAndNotify = jest.fn().mockResolvedValue(undefined);

  on = jest.fn((event: string, listener: (...args: unknown[]) => void) => {
    super.on(event, listener);
    return this;
  });
}

describe('updater listeners', () => {
  beforeEach(() => {
    resetUpdaterListenersForTesting();
  });

  it('registers updater listeners once across repeated checks', async () => {
    const updater = new MockUpdater();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const onUpdateDownloaded = jest.fn();

    await checkForUpdates(updater as unknown as UpdaterLike, logger, { onUpdateDownloaded });
    await checkForUpdates(updater as unknown as UpdaterLike, logger, { onUpdateDownloaded });

    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(2);

    updater.emit('update-available', { version: '1.2.3' });
    updater.emit('update-downloaded', { version: '1.2.3', downloadedFile: 'Flashpad.dmg' });

    expect(logger.info).toHaveBeenCalledWith('[updater] Update available:', '1.2.3');
    expect(onUpdateDownloaded).toHaveBeenCalledTimes(1);
    expect(updater.listenerCount('update-downloaded')).toBe(1);
    expect(updater.listenerCount('update-available')).toBe(1);
  });
});
