import { createMockStore, installMockElectron, buildNoteFile, MockNoteStore } from './test-helpers';
import { NoteStatus, NoteListResponse, Note, HttpError } from '@shared/index';

let store: MockNoteStore;

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
  return ((store.json.get('sync-queue.json') as { items?: Array<{ operation: string; payload: string; entityId: string }> } | undefined)?.items ?? []).filter(
    (item) => item.operation === 'CREATE'
  );
}

// Mock ApiClient
function createMockApi(overrides: Record<string, jest.Mock> = {}) {
  return {
    getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 } as NoteListResponse),
    getNote: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNotePermanently: jest.fn(),
    archiveNote: jest.fn(),
    restoreNote: jest.fn(),
    trashNote: jest.fn(),
    moveNote: jest.fn(),
    getCategories: jest.fn().mockResolvedValue([]),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    getToken: jest.fn().mockReturnValue('test-token'),
    setToken: jest.fn(),
    ...overrides,
  };
}

let SyncManager: typeof import('../syncManager').SyncManager;

beforeEach(async () => {
  jest.resetModules();

  store = createMockStore();
  installMockElectron(store);

  // Import fresh
  const mod = await import('../syncManager');
  SyncManager = mod.SyncManager;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('initialSync pagination', () => {
  it('fetches all pages when totalCount exceeds single page', async () => {
    const page1Notes: Note[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `note-${i}`,
      content: `Content ${i}`,
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const page2Notes: Note[] = Array.from({ length: 200 }, (_, i) => ({
      id: `note-${1000 + i}`,
      content: `Content ${1000 + i}`,
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const mockApi = createMockApi({
      getNotes: jest.fn()
        .mockResolvedValueOnce({ notes: page1Notes, totalCount: 1200, page: 1, pageSize: 1000 })
        .mockResolvedValueOnce({ notes: page2Notes, totalCount: 1200, page: 2, pageSize: 1000 }),
      getCategories: jest.fn().mockResolvedValue([]),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.initialSync();

    // Should have called getNotes twice (2 pages)
    expect(mockApi.getNotes).toHaveBeenCalledTimes(2);
    expect(mockApi.getNotes).toHaveBeenCalledWith({ pageSize: 1000, page: 1 });
    expect(mockApi.getNotes).toHaveBeenCalledWith({ pageSize: 1000, page: 2 });
  });

  it('fetches categories in parallel with first page', async () => {
    const mockApi = createMockApi({
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      getCategories: jest.fn().mockResolvedValue([]),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.initialSync();

    expect(mockApi.getNotes).toHaveBeenCalledTimes(1);
    expect(mockApi.getCategories).toHaveBeenCalledTimes(1);
  });

  it('handles single page (no pagination needed)', async () => {
    const notes: Note[] = [
      { id: 'n1', content: 'Hello', status: NoteStatus.Inbox, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];

    const mockApi = createMockApi({
      getNotes: jest.fn().mockResolvedValue({ notes, totalCount: 1, page: 1, pageSize: 1000 }),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.initialSync();

    // Only 1 call — no pagination
    expect(mockApi.getNotes).toHaveBeenCalledTimes(1);
  });
});

describe('processSyncQueue', () => {
  it('keeps failed items queued and surfaces retry-needed state after 3 retries', async () => {
    // Seed a note that needs syncing
    const noteFile = buildNoteFile({
      id: 'fail-note',
      content: 'Will fail',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('fail-note', noteFile);

    const mockApi = createMockApi({
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      createNote: jest.fn().mockRejectedValue(new Error('Server error')),
    });

    const onSyncItemFailed = jest.fn();

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
      onSyncItemFailed,
    });

    // Initialize to load the note (which will auto-queue it for CREATE)
    await sm.initialSync();

    // Process queue 4 times — item starts at retryCount=0, needs to fail 4 times
    // (retryCount goes 0->1->2->3, abandoned when retryCount >= 3)
    await sm.processSyncQueue();
    await sm.processSyncQueue();
    await sm.processSyncQueue();
    await sm.processSyncQueue();

    expect(onSyncItemFailed).toHaveBeenCalled();
    expect(onSyncItemFailed.mock.calls[0][0].entityType).toBe('note');
    expect(onSyncItemFailed.mock.calls[0][0].operation).toBe('CREATE');
    const queue = await require('../database').getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBeGreaterThanOrEqual(4);
    expect(queue[0].lastError).toBe('Server error');
  });

  it('sends queued note update baseVersion back to the server', async () => {
    store.notes.set('server-note-update', buildNoteFile({
      id: 'server-note-update',
      content: 'before',
      version: 3,
      isLocal: false,
      serverId: 'server-note-update',
    }));
    store.json.set('sync-queue.json', {
      items: [
        {
          id: 1,
          entityType: 'note',
          entityId: 'server-note-update',
          operation: 'UPDATE',
          payload: JSON.stringify({ content: 'after' }),
          baseVersion: 3,
          createdAt: '2026-04-12T00:00:00.000Z',
          retryCount: 0,
          lastError: null,
        },
      ],
      nextId: 2,
    });

    const updatedServerNote: Note = {
      id: 'server-note-update',
      content: 'after',
      status: NoteStatus.Inbox,
      version: 4,
      deviceId: 'test-device',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockApi = createMockApi({
      updateNote: jest.fn().mockResolvedValue(updatedServerNote),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.processSyncQueue();

    expect(mockApi.updateNote).toHaveBeenCalledWith('server-note-update', {
      content: 'after',
      deviceId: 'test-device',
      baseVersion: 3,
    });
    expect(await require('../database').getSyncQueue()).toEqual([]);
  });

  it('refreshes the latest note and clears queued update conflicts', async () => {
    store.notes.set('server-note-conflict', buildNoteFile({
      id: 'server-note-conflict',
      content: 'local change',
      version: 5,
      isLocal: false,
      serverId: 'server-note-conflict',
    }));
    store.json.set('sync-queue.json', {
      items: [
        {
          id: 1,
          entityType: 'note',
          entityId: 'server-note-conflict',
          operation: 'UPDATE',
          payload: JSON.stringify({ content: 'local change' }),
          baseVersion: 5,
          createdAt: '2026-04-12T00:00:00.000Z',
          retryCount: 0,
          lastError: null,
        },
      ],
      nextId: 2,
    });

    const latestServerNote: Note = {
      id: 'server-note-conflict',
      content: 'server change',
      status: NoteStatus.Inbox,
      version: 6,
      deviceId: 'remote-device',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const onConflict = jest.fn();

    const mockApi = createMockApi({
      updateNote: jest.fn().mockRejectedValue(new HttpError(409, 'Conflict')),
      getNote: jest.fn().mockResolvedValue(latestServerNote),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
      onConflict,
    });

    await sm.processSyncQueue();

    expect(onConflict).toHaveBeenCalledWith('server-note-conflict', 6);
    expect(await require('../database').getSyncQueue()).toEqual([]);
    expect(await require('../database').getLocalNote('server-note-conflict')).toEqual(
      expect.objectContaining({
        id: 'server-note-conflict',
        content: 'server change',
        version: 6,
      })
    );
  });
});

describe('CREATE operation in sync queue', () => {
  it('replaces local note with server note after successful create', async () => {
    // Seed a local note that needs syncing
    const noteFile = buildNoteFile({
      id: 'local_123_abc',
      content: 'New note content',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('local_123_abc', noteFile);

    const serverNote: Note = {
      id: 'server-uuid-999',
      content: 'New note content',
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockApi = createMockApi({
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      createNote: jest.fn().mockResolvedValue(serverNote),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    // Initialize (auto-queues the local note for CREATE)
    await sm.initialSync();

    // Process the queue
    await sm.processSyncQueue();

    // Old local file should be deleted
    expect(store.notes.has('local_123_abc')).toBe(false);

    // New server file should exist
    expect(store.notes.has('server-uuid-999')).toBe(true);
  });
});

describe('local-only CREATE snapshot maintenance', () => {
  it('rewrites a pending note CREATE snapshot when a local note is edited', async () => {
    const noteFile = buildNoteFile({
      id: 'local_note_1',
      content: 'Original content',
      categoryId: 'original-category',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('local_note_1', noteFile);
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('note', 'local_note_1', {
          content: 'Original content',
          categoryId: 'original-category',
          deviceId: 'old-device',
        }),
      ],
      nextId: 2,
    });

    const mockApi = createMockApi();
    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.updateNote('local_note_1', {
      content: 'Updated content',
      categoryId: 'updated-category',
    });

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(1);
    expect(queue[0].entityId).toBe('local_note_1');
    expect(JSON.parse(queue[0].payload)).toMatchObject({
      content: 'Updated content',
      categoryId: 'updated-category',
    });
  });

  it('removes a pending note CREATE snapshot when a local note is deleted', async () => {
    const noteFile = buildNoteFile({
      id: 'local_note_2',
      content: 'Delete me',
      isLocal: true,
      serverId: null,
    });
    store.notes.set('local_note_2', noteFile);
    store.json.set('sync-queue.json', {
      items: [buildPendingCreateQueueItem('note', 'local_note_2', { content: 'Delete me' })],
      nextId: 2,
    });

    const sm = new SyncManager({
      api: createMockApi() as never,
      deviceId: 'test-device',
    });

    await sm.deleteNotePermanently('local_note_2');

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(0);
    expect(store.notes.has('local_note_2')).toBe(false);
  });

  it('rewrites a pending category CREATE snapshot when a local category is edited', async () => {
    store.json.set('categories.json', {
      categories: [
        {
          id: 'local_category_1',
          name: 'Original category',
          color: '#111111',
          icon: null,
          sortOrder: 1,
          createdAt: '2026-04-12T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
          isLocal: true,
          serverId: null,
        },
      ],
    });
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('category', 'local_category_1', {
          name: 'Original category',
          color: '#111111',
        }),
      ],
      nextId: 2,
    });

    const sm = new SyncManager({
      api: createMockApi() as never,
      deviceId: 'test-device',
    });

    await sm.updateCategory('local_category_1', {
      name: 'Updated category',
      color: '#22c55e',
      icon: 'sparkles',
    });

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(1);
    expect(queue[0].entityId).toBe('local_category_1');
    expect(JSON.parse(queue[0].payload)).toMatchObject({
      name: 'Updated category',
      color: '#22c55e',
      icon: 'sparkles',
    });
  });

  it('removes a pending category CREATE snapshot when a local category is deleted', async () => {
    store.json.set('categories.json', {
      categories: [
        {
          id: 'local_category_2',
          name: 'Delete me',
          color: '#111111',
          icon: null,
          sortOrder: 1,
          createdAt: '2026-04-12T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
          isLocal: true,
          serverId: null,
        },
      ],
    });
    store.json.set('sync-queue.json', {
      items: [buildPendingCreateQueueItem('category', 'local_category_2', { name: 'Delete me', color: '#111111' })],
      nextId: 2,
    });

    const sm = new SyncManager({
      api: createMockApi() as never,
      deviceId: 'test-device',
    });

    await sm.deleteCategory('local_category_2');

    const queue = getQueuedCreates();
    expect(queue).toHaveLength(0);
  });

  it('creates a local note with its final trashed state after reconnect', async () => {
    const noteFile = buildNoteFile({
      id: 'local_note_trash',
      content: 'Final local content',
      status: NoteStatus.Trash,
      isLocal: true,
      serverId: null,
    });
    store.notes.set('local_note_trash', noteFile);
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('note', 'local_note_trash', {
          content: 'Stale queue content',
        }),
      ],
      nextId: 2,
    });

    const serverNote: Note = {
      id: 'server-trash-note',
      content: 'Final local content',
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const trashedServerNote: Note = {
      ...serverNote,
      status: NoteStatus.Trash,
      updatedAt: new Date().toISOString(),
    };

    const mockApi = createMockApi({
      createNote: jest.fn().mockResolvedValue(serverNote),
      trashNote: jest.fn().mockResolvedValue(undefined),
      getNote: jest.fn().mockResolvedValue(trashedServerNote),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.initialSync();
    await sm.processSyncQueue();

    expect(mockApi.createNote).toHaveBeenCalledWith({
      content: 'Final local content',
      categoryId: undefined,
      deviceId: undefined,
    });
    expect(mockApi.trashNote).toHaveBeenCalledWith('server-trash-note', undefined);
    expect(store.notes.has('local_note_trash')).toBe(false);
    expect(store.notes.has('server-trash-note')).toBe(true);
  });

  it('remaps temp category ids before syncing dependent local notes', async () => {
    store.json.set('categories.json', {
      categories: [
        {
          id: 'local_category_remap',
          name: 'Temp category',
          color: '#111111',
          icon: 'folder',
          sortOrder: 1,
          createdAt: '2026-04-12T00:00:00.000Z',
          updatedAt: '2026-04-12T00:00:00.000Z',
          isLocal: true,
          serverId: null,
        },
      ],
    });
    store.notes.set('local_note_remap', buildNoteFile({
      id: 'local_note_remap',
      content: 'Queued note content',
      categoryId: 'local_category_remap',
      isLocal: true,
      serverId: null,
    }));
    store.json.set('sync-queue.json', {
      items: [
        buildPendingCreateQueueItem('category', 'local_category_remap', {
          name: 'Temp category',
          color: '#111111',
          icon: 'folder',
        }, 1),
        buildPendingCreateQueueItem('note', 'local_note_remap', {
          content: 'Queued note content',
          categoryId: 'local_category_remap',
        }, 2),
      ],
      nextId: 3,
    });

    const createdCategory = {
      id: 'server-category-remap',
      name: 'Temp category',
      color: '#111111',
      icon: 'folder',
      sortOrder: 1,
      noteCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const createdNote: Note = {
      id: 'server-note-remap',
      content: 'Queued note content',
      categoryId: 'server-category-remap',
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockApi = createMockApi({
      createCategory: jest.fn().mockResolvedValue(createdCategory),
      createNote: jest.fn().mockResolvedValue(createdNote),
    });

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
    });

    await sm.processSyncQueue();

    expect(mockApi.createCategory).toHaveBeenCalledWith({
      name: 'Temp category',
      color: '#111111',
      icon: 'folder',
    });
    expect(mockApi.createNote).toHaveBeenCalledWith({
      content: 'Queued note content',
      categoryId: 'server-category-remap',
      deviceId: undefined,
    });
    expect(store.notes.has('local_note_remap')).toBe(false);
    expect(store.notes.has('server-note-remap')).toBe(true);
  });
});
