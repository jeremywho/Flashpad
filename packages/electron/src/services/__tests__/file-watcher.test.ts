import { createMockStore, installMockElectron, buildNoteFile, MockNoteStore } from './test-helpers';

let store: MockNoteStore;
let mockElectron: ReturnType<typeof installMockElectron>;

let fileWatcher: typeof import('../file-watcher');
let db: typeof import('../database');

beforeEach(async () => {
  jest.resetModules();

  store = createMockStore();
  mockElectron = installMockElectron(store);

  // Import fresh modules
  db = await import('../database');
  fileWatcher = await import('../file-watcher');
});

afterEach(async () => {
  if (fileWatcher.isFileWatcherActive()) {
    await fileWatcher.stopFileWatcher();
  }
  jest.restoreAllMocks();
});

describe('file watcher event routing', () => {
  it('ignores events for notes in writingNotes set', async () => {
    // Seed a note and initialize
    const noteFile = buildNoteFile({ id: 'writing-note', content: 'Test', isLocal: false, serverId: 'writing-note' });
    store.notes.set('writing-note', noteFile);
    await db.getLocalNotes({});

    const callback = jest.fn();
    await fileWatcher.startFileWatcher(callback);

    // Simulate that we're currently writing this note
    // We can do this by calling deleteLocalNote which adds to writingNotes
    await db.deleteLocalNote('writing-note');

    // Now simulate a file change event for the same note
    mockElectron._simulateFileChange('unlink', 'writing-note.md');

    // Wait for any async processing
    await new Promise((r) => setTimeout(r, 50));

    // Callback should NOT have been called because the note is in writingNotes
    expect(callback).not.toHaveBeenCalled();
  });

  it('routes add events to reloadNoteFromFile and calls callback', async () => {
    await db.getLocalNotes({}); // initialize

    const callback = jest.fn();
    await fileWatcher.startFileWatcher(callback);

    // Add a note file to the store
    const noteFile = buildNoteFile({ id: 'new-note', content: 'Hello', isLocal: true, serverId: null });
    store.notes.set('new-note', noteFile);

    // Simulate add event
    mockElectron._simulateFileChange('add', 'new-note.md');

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 50));

    expect(callback).toHaveBeenCalledWith('noteUpdated', 'new-note');
  });

  it('routes change events to reloadNoteFromFile and calls callback', async () => {
    // Seed a note
    const noteFile = buildNoteFile({ id: 'edit-note', content: 'Original', isLocal: false, serverId: 'edit-note' });
    store.notes.set('edit-note', noteFile);
    await db.getLocalNotes({});

    const callback = jest.fn();
    await fileWatcher.startFileWatcher(callback);

    // Update the file
    const edited = buildNoteFile({ id: 'edit-note', content: 'Modified', isLocal: false, serverId: 'edit-note' });
    store.notes.set('edit-note', edited);

    mockElectron._simulateFileChange('change', 'edit-note.md');

    await new Promise((r) => setTimeout(r, 50));

    expect(callback).toHaveBeenCalledWith('noteUpdated', 'edit-note');
  });

  it('routes unlink events to handleFileDeleted and calls callback', async () => {
    // Seed a note
    const noteFile = buildNoteFile({ id: 'del-note', content: 'Will delete', isLocal: false, serverId: 'del-note' });
    store.notes.set('del-note', noteFile);
    await db.getLocalNotes({});

    const callback = jest.fn();
    await fileWatcher.startFileWatcher(callback);

    // Remove from store (simulating actual file deletion)
    store.notes.delete('del-note');

    mockElectron._simulateFileChange('unlink', 'del-note.md');

    await new Promise((r) => setTimeout(r, 50));

    expect(callback).toHaveBeenCalledWith('noteDeleted', 'del-note');
  });

  it('ignores non-.md files', async () => {
    await db.getLocalNotes({});

    const callback = jest.fn();
    await fileWatcher.startFileWatcher(callback);

    mockElectron._simulateFileChange('add', 'categories.json');

    await new Promise((r) => setTimeout(r, 50));

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('file watcher lifecycle', () => {
  it('starts and stops correctly', async () => {
    const callback = jest.fn();

    expect(fileWatcher.isFileWatcherActive()).toBe(false);

    await fileWatcher.startFileWatcher(callback);
    expect(fileWatcher.isFileWatcherActive()).toBe(true);

    await fileWatcher.stopFileWatcher();
    expect(fileWatcher.isFileWatcherActive()).toBe(false);
  });

  it('does not start twice', async () => {
    const callback = jest.fn();

    await fileWatcher.startFileWatcher(callback);
    await fileWatcher.startFileWatcher(callback); // second call should be no-op

    expect(mockElectron.fs.watchStart).toHaveBeenCalledTimes(1);
  });
});
