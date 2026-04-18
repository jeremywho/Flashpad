import { NoteStatus } from '@flashpad/shared';
import {
  addToSyncQueue,
  deleteLocalCategory,
  deleteLocalNote,
  getLocalNote,
  getSyncQueue,
  saveLocalCategory,
  saveLocalNote,
  remapLocalCategoryReferences,
  SyncOperation,
} from '../database';
import { setApiEnvironment } from '../../config';

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

describe('database sync queue snapshots', () => {
  beforeEach(async () => {
    mockStorage.clear();
    jest.clearAllMocks();
    await setApiEnvironment('local');
  });

  it('keeps local note data and queued writes isolated by environment', async () => {
    const localNote = {
      id: 'local_note_env_local',
      content: 'local environment note',
      categoryId: 'category_local',
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: 'device_local',
      createdAt: '2026-04-12T09:00:00.000Z',
      updatedAt: '2026-04-12T09:00:00.000Z',
    };
    const productionNote = {
      id: 'local_note_env_prod',
      content: 'production environment note',
      categoryId: 'category_prod',
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: 'device_prod',
      createdAt: '2026-04-12T09:10:00.000Z',
      updatedAt: '2026-04-12T09:10:00.000Z',
    };

    await saveLocalNote(localNote, true);
    await addToSyncQueue({
      entityType: 'note',
      entityId: localNote.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        content: localNote.content,
        categoryId: localNote.categoryId,
        deviceId: localNote.deviceId,
        status: localNote.status,
      }),
      baseVersion: null,
    });

    expect(await getLocalNote(localNote.id)).toEqual({
      ...localNote,
      isLocal: true,
      serverId: null,
    });
    expect(await getSyncQueue()).toHaveLength(1);

    await setApiEnvironment('production');

    expect(await getLocalNote(localNote.id)).toBeNull();
    expect(await getSyncQueue()).toEqual([]);

    await saveLocalNote(productionNote, true);

    expect(await getLocalNote(productionNote.id)).toEqual({
      ...productionNote,
      isLocal: true,
      serverId: null,
    });

    await setApiEnvironment('local');

    expect(await getLocalNote(localNote.id)).toEqual({
      ...localNote,
      isLocal: true,
      serverId: null,
    });
    expect(await getLocalNote(productionNote.id)).toBeNull();
    expect(await getSyncQueue()).toHaveLength(1);
  });

  it('rewrites a queued local note CREATE snapshot as the note is edited and its state changes', async () => {
    const baseNote = {
      id: 'local_note_1',
      content: 'draft',
      categoryId: 'category_a',
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: 'device_1',
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
    };

    await saveLocalNote(baseNote, true);
    await addToSyncQueue({
      entityType: 'note',
      entityId: baseNote.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        content: baseNote.content,
        categoryId: baseNote.categoryId,
        deviceId: baseNote.deviceId,
        status: baseNote.status,
      }),
      baseVersion: null,
    });

    await saveLocalNote(
      {
        ...baseNote,
        content: 'edited',
        categoryId: 'category_b',
        updatedAt: '2026-04-12T10:05:00.000Z',
      },
      true
    );
    await saveLocalNote(
      {
        ...baseNote,
        content: 'edited',
        categoryId: 'category_b',
        status: NoteStatus.Archived,
        updatedAt: '2026-04-12T10:10:00.000Z',
      },
      true
    );
    await saveLocalNote(
      {
        ...baseNote,
        content: 'edited',
        categoryId: 'category_b',
        status: NoteStatus.Inbox,
        updatedAt: '2026-04-12T10:15:00.000Z',
      },
      true
    );
    await saveLocalNote(
      {
        ...baseNote,
        content: 'edited',
        categoryId: 'category_b',
        status: NoteStatus.Trash,
        updatedAt: '2026-04-12T10:20:00.000Z',
      },
      true
    );

    const queue = await getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(JSON.parse(queue[0].payload)).toEqual({
      content: 'edited',
      categoryId: 'category_b',
      deviceId: 'device_1',
      status: NoteStatus.Trash,
    });
  });

  it('rewrites a queued local category CREATE snapshot when the category is edited', async () => {
    const baseCategory = {
      id: 'local_category_1',
      name: 'Inbox',
      color: '#111111',
      icon: 'tray',
      sortOrder: 1,
      noteCount: 0,
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
    };

    await saveLocalCategory(baseCategory, true);
    await addToSyncQueue({
      entityType: 'category',
      entityId: baseCategory.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        name: baseCategory.name,
        color: baseCategory.color,
        icon: baseCategory.icon,
        sortOrder: baseCategory.sortOrder,
      }),
      baseVersion: null,
    });

    await saveLocalCategory(
      {
        ...baseCategory,
        name: 'Projects',
        color: '#333333',
        icon: 'folder',
        sortOrder: 7,
        updatedAt: '2026-04-12T10:30:00.000Z',
      },
      true
    );

    const queue = await getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(JSON.parse(queue[0].payload)).toEqual({
      name: 'Projects',
      color: '#333333',
      icon: 'folder',
      sortOrder: 7,
    });
  });

  it('cancels queued local CREATE snapshots when the local note or category is deleted before sync', async () => {
    const note = {
      id: 'local_note_2',
      content: 'draft',
      status: NoteStatus.Inbox,
      version: 1,
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
    };
    const category = {
      id: 'local_category_2',
      name: 'Archive',
      color: '#222222',
      sortOrder: 2,
      noteCount: 0,
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
    };

    await saveLocalNote(note, true);
    await saveLocalCategory(category, true);
    await addToSyncQueue({
      entityType: 'note',
      entityId: note.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({ content: note.content, status: note.status }),
      baseVersion: null,
    });
    await addToSyncQueue({
      entityType: 'category',
      entityId: category.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        name: category.name,
        color: category.color,
        sortOrder: category.sortOrder,
      }),
      baseVersion: null,
    });

    await deleteLocalNote(note.id);
    await deleteLocalCategory(category.id);

    expect(await getSyncQueue()).toEqual([]);
  });

  it('remaps queued note payloads from a temp category id to the server category id', async () => {
    const tempCategoryId = 'local_category_3';
    const serverCategoryId = 'server_category_3';
    const note = {
      id: 'local_note_3',
      content: 'draft',
      categoryId: tempCategoryId,
      status: NoteStatus.Trash,
      version: 1,
      deviceId: 'device_1',
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
    };

    await saveLocalNote(note, true);
    await addToSyncQueue({
      entityType: 'note',
      entityId: note.id,
      operation: SyncOperation.Create,
      payload: JSON.stringify({
        content: note.content,
        categoryId: tempCategoryId,
        deviceId: note.deviceId,
        status: note.status,
      }),
      baseVersion: null,
    });
    await addToSyncQueue({
      entityType: 'note',
      entityId: note.id,
      operation: SyncOperation.Update,
      payload: JSON.stringify({
        content: 'edited',
        categoryId: tempCategoryId,
        deviceId: note.deviceId,
      }),
      baseVersion: 1,
    });
    await addToSyncQueue({
      entityType: 'note',
      entityId: note.id,
      operation: SyncOperation.Move,
      payload: JSON.stringify({
        categoryId: tempCategoryId,
      }),
      baseVersion: null,
    });

    await remapLocalCategoryReferences(tempCategoryId, serverCategoryId);

    expect(await getLocalNote(note.id)).toEqual({
      ...note,
      categoryId: serverCategoryId,
      isLocal: true,
      serverId: null,
    });

    const queue = await getSyncQueue();
    expect(queue).toHaveLength(3);
    expect(queue.map((item) => JSON.parse(item.payload))).toEqual([
      {
        content: 'draft',
        categoryId: serverCategoryId,
        deviceId: 'device_1',
        status: NoteStatus.Trash,
      },
      {
        content: 'edited',
        categoryId: serverCategoryId,
        deviceId: 'device_1',
      },
      {
        categoryId: serverCategoryId,
      },
    ]);
  });
});
