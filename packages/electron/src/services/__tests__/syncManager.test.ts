import { createMockStore, installMockElectron, buildNoteFile, MockNoteStore } from './test-helpers';
import { NoteStatus, NoteListResponse, Note } from '@shared/index';

let store: MockNoteStore;

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
  it('calls onSyncItemFailed after 3 retries', async () => {
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
  });
});

describe('getNotes background refresh', () => {
  it('calls onDataRefresh after background bulkSaveNotes', async () => {
    const serverNotes: Note[] = [
      { id: 'srv-1', content: 'Server note', status: NoteStatus.Inbox, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];

    const mockApi = createMockApi({
      getNotes: jest.fn().mockResolvedValue({
        notes: serverNotes,
        totalCount: 1,
        page: 1,
        pageSize: 1000,
      }),
    });

    const onDataRefresh = jest.fn();

    const sm = new SyncManager({
      api: mockApi as never,
      deviceId: 'test-device',
      onDataRefresh,
    });

    // Perform initial sync first
    await sm.initialSync();
    onDataRefresh.mockClear();
    mockApi.getNotes.mockClear();

    // Call getNotes which triggers background refresh
    mockApi.getNotes.mockResolvedValue({
      notes: serverNotes,
      totalCount: 1,
      page: 1,
      pageSize: 1000,
    });

    await sm.getNotes({ status: NoteStatus.Inbox });

    // Wait for background promise to resolve
    await new Promise((r) => setTimeout(r, 100));

    expect(onDataRefresh).toHaveBeenCalled();
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
