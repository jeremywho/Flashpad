import { createMockStore, installMockElectron, buildNoteFile, MockNoteStore } from './test-helpers';
import { NoteStatus } from '@shared/index';

let store: MockNoteStore;

// We need to re-import database.ts for each test to reset the module state
// (notesCache, initialized flag, etc.)
let db: typeof import('../database');

function buildPendingCreateQueueItem(
  entityType: 'note' | 'category',
  entityId: string,
  payload: Record<string, unknown>,
  id = 1
) {
  return {
    id,
    entityType,
    entityId,
    operation: 'CREATE',
    payload: JSON.stringify(payload),
    baseVersion: null,
    createdAt: '2026-04-12T00:00:00.000Z',
    retryCount: 0,
    lastError: null,
  };
}

function getQueuedCreates() {
  return ((store.json.get('sync-queue.json') as { items?: Array<{ operation: string; payload: string }> } | undefined)?.items ?? []).filter(
    (item) => item.operation === 'CREATE'
  );
}

beforeEach(async () => {
  // Reset module registry so database.ts reinitializes
  jest.resetModules();

  store = createMockStore();
  installMockElectron(store);

  // Import fresh module
  db = await import('../database');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteLocalNote', () => {
  it('adds note ID to writingNotes set to prevent file watcher feedback', async () => {
    // Seed a note
    const noteFile = buildNoteFile({ id: 'note-1', content: 'Hello', isLocal: false, serverId: 'note-1' });
    store.notes.set('note-1', noteFile);

    // Initialize and load
    await db.getLocalNotes({});

    // Delete the note
    await db.deleteLocalNote('note-1');

    // The note should be in writingNotes (checked via isWritingNote)
    expect(db.isWritingNote('note-1')).toBe(true);

    // After the TTL elapses the guard should be cleared
    await new Promise((r) => setTimeout(r, db.WRITING_NOTES_TTL_MS + 100));
    expect(db.isWritingNote('note-1')).toBe(false);
  }, 10_000);

  it('removes note from cache and deletes file', async () => {
    const noteFile = buildNoteFile({ id: 'note-2', content: 'Test' });
    store.notes.set('note-2', noteFile);

    await db.getLocalNotes({});
    await db.deleteLocalNote('note-2');

    // Cache should no longer have the note
    const notes = await db.getLocalNotes({});
    expect(notes.find((n) => n.id === 'note-2')).toBeUndefined();

    // File should be deleted
    expect(store.notes.has('note-2')).toBe(false);
  });
});

describe('handleFileDeleted', () => {
  it('queues server DELETE when note has serverId', async () => {
    const noteFile = buildNoteFile({
      id: 'synced-note',
      content: 'Synced content',
      isLocal: false,
      serverId: 'server-uuid-123',
      version: 3,
    });
    store.notes.set('synced-note', noteFile);

    // Initialize
    await db.getLocalNotes({});

    // Simulate external file deletion
    await db.handleFileDeleted('synced-note');

    // Should have queued a DELETE operation
    const queue = await db.getSyncQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].entityType).toBe('note');
    expect(queue[0].entityId).toBe('server-uuid-123');
    expect(queue[0].operation).toBe('DELETE');
    expect(queue[0].baseVersion).toBe(3);
  });

  it('does NOT queue server DELETE for local-only notes', async () => {
    const noteFile = buildNoteFile({
      id: 'local-note',
      content: 'Local only',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('local-note', noteFile);

    await db.getLocalNotes({});
    await db.handleFileDeleted('local-note');

    // No sync queue item should be created
    const queue = await db.getSyncQueue();
    // Filter out any items that were created during init for unsynced notes
    const deleteItems = queue.filter((i) => i.operation === 'DELETE');
    expect(deleteItems.length).toBe(0);
  });

  it('removes note from cache', async () => {
    const noteFile = buildNoteFile({ id: 'del-note', content: 'Will delete' });
    store.notes.set('del-note', noteFile);

    await db.getLocalNotes({});
    await db.handleFileDeleted('del-note');

    const notes = await db.getLocalNotes({});
    expect(notes.find((n) => n.id === 'del-note')).toBeUndefined();
  });
});

describe('reloadNoteFromFile', () => {
  it('queues CREATE for new file with isLocal=true and no serverId', async () => {
    // Initialize with empty state
    await db.getLocalNotes({});

    // Simulate dropping a file with frontmatter
    const noteFile = buildNoteFile({
      id: 'dropped-note',
      content: '# YouTube Summary\nSome content here',
      categoryId: 'yt-category-id',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('dropped-note', noteFile);

    const note = await db.reloadNoteFromFile('dropped-note');

    expect(note).not.toBeNull();
    expect(note!.id).toBe('dropped-note');
    expect(note!.categoryId).toBe('yt-category-id');

    // Should have queued a CREATE
    const queue = await db.getSyncQueue();
    const createItem = queue.find(
      (i) => i.entityId === 'dropped-note' && i.operation === 'CREATE'
    );
    expect(createItem).toBeDefined();
    expect(JSON.parse(createItem!.payload).categoryId).toBe('yt-category-id');
  });

  it('queues UPDATE when synced note content changes externally', async () => {
    // Seed an existing synced note
    const noteFile = buildNoteFile({
      id: 'existing-note',
      content: 'Original content',
      isLocal: false,
      serverId: 'existing-note',
      version: 2,
    });
    store.notes.set('existing-note', noteFile);

    // Load it
    await db.getLocalNotes({});

    // Simulate external edit
    const editedFile = buildNoteFile({
      id: 'existing-note',
      content: 'Edited content',
      isLocal: false,
      serverId: 'existing-note',
      version: 2,
    });
    store.notes.set('existing-note', editedFile);

    await db.reloadNoteFromFile('existing-note');

    // Should have queued an UPDATE
    const queue = await db.getSyncQueue();
    const updateItem = queue.find(
      (i) => i.entityId === 'existing-note' && i.operation === 'UPDATE'
    );
    expect(updateItem).toBeDefined();
    expect(JSON.parse(updateItem!.payload).content).toBe('Edited content');
    expect(updateItem!.baseVersion).toBe(2);
  });

  it('treats malicious frontmatter ids as plain markdown and regenerates a safe local id', async () => {
    // Initialize with empty state
    await db.getLocalNotes({});

    // Simulate a file whose frontmatter tries to traverse out of the notes dir.
    const maliciousFile = buildNoteFile({
      id: '../../escape',
      content: '# Safe content\nThe frontmatter id is unsafe.',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('malicious-frontmatter', maliciousFile);

    const note = await db.reloadNoteFromFile('malicious-frontmatter');

    expect(note).not.toBeNull();
    expect(note!.id).toMatch(/^local_/);
    expect(note!.content).toContain('The frontmatter id is unsafe.');

    // The original unsafe file should be replaced by a generated note file.
    expect(store.notes.has('malicious-frontmatter')).toBe(false);

    const queue = await db.getSyncQueue();
    const createItem = queue.find((i) => i.entityId === note!.id && i.operation === 'CREATE');
    expect(createItem).toBeDefined();
  });

  it('does NOT queue UPDATE when content has not changed', async () => {
    const noteFile = buildNoteFile({
      id: 'unchanged-note',
      content: 'Same content',
      isLocal: false,
      serverId: 'unchanged-note',
      version: 2,
    });
    store.notes.set('unchanged-note', noteFile);

    await db.getLocalNotes({});

    // Reload without changing content
    await db.reloadNoteFromFile('unchanged-note');

    const queue = await db.getSyncQueue();
    const updateItem = queue.find(
      (i) => i.entityId === 'unchanged-note' && i.operation === 'UPDATE'
    );
    expect(updateItem).toBeUndefined();
  });
});

describe('ingestPlainMarkdown (via reloadNoteFromFile)', () => {
  it('generates frontmatter for plain markdown files and queues CREATE', async () => {
    // Initialize
    await db.getLocalNotes({});

    // Drop a plain markdown file (no frontmatter)
    store.notes.set('plain-file', '# My Note\n\nJust some plain text.');

    const note = await db.reloadNoteFromFile('plain-file');

    expect(note).not.toBeNull();
    // ID should be a generated local_ ID, not 'plain-file'
    expect(note!.id).toMatch(/^local_/);
    expect(note!.content).toBe('# My Note\n\nJust some plain text.');

    // Original file should be deleted
    expect(store.notes.has('plain-file')).toBe(false);

    // New file with generated ID should exist
    expect(store.notes.has(note!.id)).toBe(true);

    // Should have queued a CREATE
    const queue = await db.getSyncQueue();
    const createItem = queue.find((i) => i.entityId === note!.id && i.operation === 'CREATE');
    expect(createItem).toBeDefined();
  });
});

describe('bulkSaveNotes', () => {
  it('skips updating local notes (protects unsynced work)', async () => {
    // Seed a local note
    const localNote = buildNoteFile({
      id: 'local-wip',
      content: 'Work in progress',
      isLocal: true,
      serverId: null,
      version: 1,
    });
    store.notes.set('local-wip', localNote);

    await db.getLocalNotes({});

    // Try to overwrite with a server version using the same ID
    await db.bulkSaveNotes([
      {
        id: 'local-wip',
        content: 'Server version',
        status: NoteStatus.Inbox,
        version: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Local version should be preserved
    const note = await db.getLocalNote('local-wip');
    expect(note).not.toBeNull();
    expect(note!.content).toBe('Work in progress');
  });

  it('updates non-local notes when server version is newer', async () => {
    const syncedNote = buildNoteFile({
      id: 'synced-1',
      content: 'Old content',
      isLocal: false,
      serverId: 'synced-1',
      version: 1,
    });
    store.notes.set('synced-1', syncedNote);

    await db.getLocalNotes({});

    await db.bulkSaveNotes([
      {
        id: 'synced-1',
        content: 'Updated from server',
        status: NoteStatus.Inbox,
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const note = await db.getLocalNote('synced-1');
    expect(note).not.toBeNull();
    expect(note!.content).toBe('Updated from server');
    expect(note!.version).toBe(2);
  });

  it('creates new notes from server', async () => {
    await db.getLocalNotes({}); // initialize

    await db.bulkSaveNotes([
      {
        id: 'new-server-note',
        content: 'From server',
        status: NoteStatus.Inbox,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const note = await db.getLocalNote('new-server-note');
    expect(note).not.toBeNull();
    expect(note!.content).toBe('From server');

    // File should exist on disk
    expect(store.notes.has('new-server-note')).toBe(true);
  });
});

describe('startup unsynced note detection', () => {
  it('queues CREATE for notes with isLocal=true and no serverId on init', async () => {
    // Seed an unsynced note
    const unsyncedFile = buildNoteFile({
      id: 'unsynced-at-boot',
      content: 'Never made it to server',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('unsynced-at-boot', unsyncedFile);

    // Initialize (this triggers the unsynced detection)
    await db.getLocalNotes({});

    const queue = await db.getSyncQueue();
    const createItem = queue.find(
      (i) => i.entityId === 'unsynced-at-boot' && i.operation === 'CREATE'
    );
    expect(createItem).toBeDefined();
  });

  it('rewrites an existing local-only CREATE snapshot to the latest note file state on init', async () => {
    const noteFile = buildNoteFile({
      id: 'stale-local-note',
      content: 'Latest local content',
      categoryId: 'updated-category',
      isLocal: true,
      serverId: null,
      version: 4,
    });
    store.notes.set('stale-local-note', noteFile);
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('note', 'stale-local-note', {
          content: 'Old content',
          categoryId: 'old-category',
          deviceId: 'old-device',
        }),
      ],
      nextId: 2,
    });

    await db.getLocalNotes({});

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(1);
    expect(JSON.parse(queue[0].payload)).toMatchObject({
      content: 'Latest local content',
      categoryId: 'updated-category',
    });
  });
});

describe('startup unsynced category detection', () => {
  it('rewrites an existing local-only CREATE snapshot to the latest category file state on init', async () => {
    store.json.set('categories.json', {
      categories: [
        {
          id: 'local-category',
          name: 'Latest category',
          color: '#22c55e',
          icon: 'sparkles',
          sortOrder: 7,
          createdAt: '2026-04-12T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
          isLocal: true,
          serverId: null,
        },
      ],
    });
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('category', 'local-category', {
          name: 'Old category',
          color: '#111111',
        }),
      ],
      nextId: 2,
    });

    await db.getLocalCategories();

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(1);
    expect(JSON.parse(queue[0].payload)).toMatchObject({
      name: 'Latest category',
      color: '#22c55e',
      icon: 'sparkles',
    });
  });
});
