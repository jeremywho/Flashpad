import { h4 } from '@shared/index';
import { FileChangeEvent } from '../types/electron';
import {
  isWritingNote,
  reloadNoteFromFile,
  handleFileDeleted,
} from './database';

type FileWatcherCallback = (event: 'noteUpdated' | 'noteDeleted', noteId: string) => void;

let isWatching = false;
let callback: FileWatcherCallback | null = null;

/**
 * Start watching for file changes.
 * @param onFileChange Callback that will be called when a note file changes.
 */
export async function startFileWatcher(
  onFileChange: FileWatcherCallback
): Promise<void> {
  if (isWatching) return;

  callback = onFileChange;

  window.electron.fs.onFileChanged(handleFileChange);
  window.electron.fs.onWatcherReady(({ notesDir }) => {
    h4.info('File watcher ready', { notesDir });
  });
  window.electron.fs.onWatcherError(({ error }) => {
    h4.error('File watcher error', { error });
  });

  await window.electron.fs.watchStart();
  h4.info('File watcher started');

  isWatching = true;
}

/**
 * Stop watching for file changes.
 */
export async function stopFileWatcher(): Promise<void> {
  if (!isWatching) return;

  await window.electron.fs.watchStop();
  window.electron.fs.removeFileChangedListener();
  window.electron.fs.removeWatcherLifecycleListeners();

  callback = null;
  isWatching = false;
}

/**
 * Handle a file change event from the main process.
 */
async function handleFileChange(event: FileChangeEvent): Promise<void> {
  if (!callback) return;

  const { type, filename, filePath } = event;
  const noteId = filename.replace(/\.md$/, '');
  const ownWrite = isWritingNote(noteId);

  h4.info('File watcher event', { type, filename, filePath, ownWrite });

  if (ownWrite) return;

  if (type === 'unlink') {
    await handleFileDeleted(noteId);
    callback('noteDeleted', noteId);
  } else if (type === 'add' || type === 'change') {
    const note = await reloadNoteFromFile(noteId);
    if (note) {
      callback('noteUpdated', noteId);
    }
  }
}

/**
 * Check if the file watcher is currently active.
 */
export function isFileWatcherActive(): boolean {
  return isWatching;
}
