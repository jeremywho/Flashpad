import { ApiClient, HttpError, NoteStatus } from '@flashpad/shared';
import { AppState } from 'react-native';
import {
  addToSyncQueue,
  getLocalNote,
  getSyncQueue,
  saveLocalCategory,
  saveLocalNote,
  SyncOperation,
} from '../database';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => mockStorage.delete(key));
    }),
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const mockNetInfo = {
  fetch: jest.fn(),
  addEventListener: jest.fn(),
};
(mockNetInfo as any).default = mockNetInfo;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: mockNetInfo,
  ...mockNetInfo,
}));

const { SyncManager: SyncManagerClass } = require('../syncManager');

describe('SyncManager local-first category promotion', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    mockNetInfo.fetch.mockResolvedValue({ isConnected: true });
    mockNetInfo.addEventListener.mockReturnValue(jest.fn());
    (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
  });

  function createManager() {
    const api = {
      createCategory: jest.fn(),
      createNote: jest.fn(),
      archiveNote: jest.fn(),
      trashNote: jest.fn(),
    } as unknown as ApiClient;

    return {
      api,
      manager: new SyncManagerClass({
        api,
        onSyncStatusChange: jest.fn(),
        onPendingCountChange: jest.fn(),
        onDataRefresh: jest.fn(),
      }),
    };
  }

  it('remaps temp category ids before note sync and keeps the latest trashed note state', async () => {
    const tempCategoryId = 'local_category_1';
    const serverCategoryId = 'server_category_1';
    const localNoteId = 'local_note_1';
    const serverNoteId = 'server_note_1';

    const tempCategory = {
      id: tempCategoryId,
      name: 'Temp',
      color: '#111111',
      icon: 'folder',
      sortOrder: 4,
      noteCount: 0,
      createdAt: '2026-04-12T11:00:00.000Z',
      updatedAt: '2026-04-12T11:00:00.000Z',
    };
    const localNote = {
      id: localNoteId,
      content: 'final content',
      categoryId: tempCategoryId,
      status: NoteStatus.Trash,
      version: 1,
      deviceId: 'device_1',
      createdAt: '2026-04-12T11:00:00.000Z',
      updatedAt: '2026-04-12T11:05:00.000Z',
    };
    const serverCategory = {
      id: serverCategoryId,
      name: 'Temp',
      color: '#111111',
      icon: 'folder',
      sortOrder: 4,
      noteCount: 0,
      createdAt: '2026-04-12T11:00:00.000Z',
      updatedAt: '2026-04-12T11:10:00.000Z',
    };
    const serverNote = {
      id: serverNoteId,
      content: 'final content',
      categoryId: serverCategoryId,
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: 'device_1',
      createdAt: '2026-04-12T11:00:00.000Z',
      updatedAt: '2026-04-12T11:10:00.000Z',
    };

    const { api, manager } = createManager();
    await saveLocalCategory(tempCategory, true);
    await saveLocalNote(localNote, true);
    await addToSyncQueue({
      entityType: 'category',
      entityId: tempCategoryId,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        name: tempCategory.name,
        color: tempCategory.color,
        icon: tempCategory.icon,
        sortOrder: tempCategory.sortOrder,
      }),
      baseVersion: null,
    });
    await addToSyncQueue({
      entityType: 'note',
      entityId: localNoteId,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        content: localNote.content,
        categoryId: tempCategoryId,
        deviceId: localNote.deviceId,
        status: localNote.status,
      }),
      baseVersion: null,
    });

    (api.createCategory as jest.Mock).mockResolvedValue(serverCategory);
    (api.createNote as jest.Mock).mockResolvedValue(serverNote);
    (api.trashNote as jest.Mock).mockResolvedValue(undefined);

    await manager.processSyncQueue();

    expect(api.createCategory).toHaveBeenCalledWith({
      name: 'Temp',
      color: '#111111',
      icon: 'folder',
    });
    expect(api.createNote).toHaveBeenCalledWith({
      content: 'final content',
      categoryId: serverCategoryId,
      deviceId: 'device_1',
    });
    expect(api.trashNote).toHaveBeenCalledWith(serverNoteId, 'device_1');

    expect(await getSyncQueue()).toEqual([]);
    expect(await getLocalNote(serverNoteId)).toEqual(
      expect.objectContaining({
        id: serverNoteId,
        categoryId: serverCategoryId,
        status: NoteStatus.Trash,
        content: 'final content',
        deviceId: 'device_1',
        isLocal: false,
        serverId: serverNoteId,
      })
    );
  });

  it('keeps failed sync items queued after repeated retries', async () => {
    const localNoteId = 'local_note_retry';
    const localNote = {
      id: localNoteId,
      content: 'retry me',
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: '2026-04-12T12:00:00.000Z',
      updatedAt: '2026-04-12T12:00:00.000Z',
    };

    const syncStatuses: string[] = [];
    const api = {
      createNote: jest.fn().mockRejectedValue(new Error('Server error')),
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      getCategories: jest.fn().mockResolvedValue([]),
    } as unknown as ApiClient;

    await saveLocalNote(localNote, true);
    await addToSyncQueue({
      entityType: 'note',
      entityId: localNoteId,
      operation: SyncOperation.Create,
      payload: JSON.stringify({ content: localNote.content }),
      baseVersion: null,
    });

    const manager = new SyncManagerClass({
      api,
      onSyncStatusChange: (status) => {
        syncStatuses.push(status);
      },
      onPendingCountChange: jest.fn(),
      onDataRefresh: jest.fn(),
    });

    await manager.processSyncQueue();
    await manager.processSyncQueue();
    await manager.processSyncQueue();
    await manager.processSyncQueue();

    const queue = await getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBeGreaterThanOrEqual(4);
    expect(queue[0].lastError).toBe('Server error');
    expect(syncStatuses).toContain('error');
  });

  it('sends baseVersion and deviceId when replaying queued note updates', async () => {
    const existingNote = {
      id: 'server_note_update',
      content: 'before',
      status: NoteStatus.Inbox,
      version: 3,
      createdAt: '2026-04-12T12:30:00.000Z',
      updatedAt: '2026-04-12T12:30:00.000Z',
    };
    const updatedServerNote = {
      ...existingNote,
      content: 'after',
      version: 4,
      deviceId: 'device_from_manager',
      updatedAt: '2026-04-12T12:31:00.000Z',
    };

    const api = {
      updateNote: jest.fn().mockResolvedValue(updatedServerNote),
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      getCategories: jest.fn().mockResolvedValue([]),
    } as unknown as ApiClient;

    await saveLocalNote(existingNote, false);
    await addToSyncQueue({
      entityType: 'note',
      entityId: existingNote.id,
      operation: SyncOperation.Update,
      payload: JSON.stringify({ content: 'after' }),
      baseVersion: 3,
    });

    const manager = new SyncManagerClass({
      api,
      deviceId: 'device_from_manager',
      onSyncStatusChange: jest.fn(),
      onPendingCountChange: jest.fn(),
      onDataRefresh: jest.fn(),
    });

    await manager.processSyncQueue();

    expect(api.updateNote).toHaveBeenCalledWith(existingNote.id, {
      content: 'after',
      deviceId: 'device_from_manager',
      baseVersion: 3,
    });
    expect(await getSyncQueue()).toEqual([]);
  });

  it('refreshes the latest note and clears queued conflicts on 409', async () => {
    const existingNote = {
      id: 'server_note_conflict',
      content: 'local change',
      status: NoteStatus.Inbox,
      version: 5,
      createdAt: '2026-04-12T13:00:00.000Z',
      updatedAt: '2026-04-12T13:00:00.000Z',
    };
    const latestServerNote = {
      ...existingNote,
      content: 'server change',
      version: 6,
      deviceId: 'remote-device',
      updatedAt: '2026-04-12T13:01:00.000Z',
    };
    const onConflict = jest.fn();

    const api = {
      updateNote: jest.fn().mockRejectedValue(new HttpError(409, 'Conflict')),
      getNote: jest.fn().mockResolvedValue(latestServerNote),
      getNotes: jest.fn().mockResolvedValue({ notes: [], totalCount: 0, page: 1, pageSize: 1000 }),
      getCategories: jest.fn().mockResolvedValue([]),
    } as unknown as ApiClient;

    await saveLocalNote(existingNote, false);
    await addToSyncQueue({
      entityType: 'note',
      entityId: existingNote.id,
      operation: SyncOperation.Update,
      payload: JSON.stringify({ content: 'local change' }),
      baseVersion: 5,
    });

    const manager = new SyncManagerClass({
      api,
      deviceId: 'device_from_manager',
      onSyncStatusChange: jest.fn(),
      onPendingCountChange: jest.fn(),
      onDataRefresh: jest.fn(),
      onConflict,
    });

    await manager.processSyncQueue();

    expect(onConflict).toHaveBeenCalledWith(existingNote.id, 6);
    expect(await getSyncQueue()).toEqual([]);
    expect(await getLocalNote(existingNote.id)).toEqual(
      expect.objectContaining({
        id: existingNote.id,
        content: 'server change',
        version: 6,
      })
    );
  });

  it('returns the latest server note on direct update conflicts', async () => {
    const existingNote = {
      id: 'server_note_direct_conflict',
      content: 'before',
      status: NoteStatus.Inbox,
      version: 7,
      createdAt: '2026-04-12T13:30:00.000Z',
      updatedAt: '2026-04-12T13:30:00.000Z',
    };
    const latestServerNote = {
      ...existingNote,
      content: 'server latest',
      version: 8,
      deviceId: 'remote-device',
      updatedAt: '2026-04-12T13:31:00.000Z',
    };
    const onConflict = jest.fn();

    const api = {
      updateNote: jest.fn().mockRejectedValue(new HttpError(409, 'Conflict')),
      getNote: jest.fn().mockResolvedValue(latestServerNote),
    } as unknown as ApiClient;

    await saveLocalNote(existingNote, false);

    const manager = new SyncManagerClass({
      api,
      deviceId: 'device_from_manager',
      onConflict,
    });

    const resolvedNote = await manager.updateNote(existingNote.id, {
      content: 'stale local edit',
    });

    expect(api.updateNote).toHaveBeenCalledWith(existingNote.id, {
      content: 'stale local edit',
      deviceId: 'device_from_manager',
      baseVersion: 7,
    });
    expect(onConflict).toHaveBeenCalledWith(existingNote.id, 8);
    expect(resolvedNote).toEqual(expect.objectContaining({
      id: existingNote.id,
      content: 'server latest',
      version: 8,
    }));
  });
});
