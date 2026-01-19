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

  // Set up the IPC listener
  window.electron.fs.onFileChanged(handleFileChange);

  // Start the watcher in the main process
  await window.electron.fs.watchStart();

  isWatching = true;
}

/**
 * Stop watching for file changes.
 */
export async function stopFileWatcher(): Promise<void> {
  if (!isWatching) return;

  // Stop the watcher in the main process
  await window.electron.fs.watchStop();

  // Remove the IPC listener
  window.electron.fs.removeFileChangedListener();

  callback = null;
  isWatching = false;
}

/**
 * Handle a file change event from the main process.
 */
async function handleFileChange(event: FileChangeEvent): Promise<void> {
  if (!callback) return;

  const { type, filename } = event;

  // Extract note ID from filename (e.g., "abc123.md" -> "abc123")
  if (!filename.endsWith('.md')) return;

  const noteId = filename.replace(/\.md$/, '');

  // Ignore our own writes
  if (isWritingNote(noteId)) {
    return;
  }

  if (type === 'unlink') {
    // File was deleted
    await handleFileDeleted(noteId);
    callback('noteDeleted', noteId);
  } else if (type === 'add' || type === 'change') {
    // File was added or changed - reload it
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
