import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note, Category, NoteStatus } from '@flashpad/shared';
import { getNamespacedStorageKey } from '../config';

const STORAGE_KEY_NAMES = {
  NOTES: 'notes',
  CATEGORIES: 'categories',
  SYNC_QUEUE: 'sync_queue',
} as const;

function getNotesStorageKey(): string {
  return getNamespacedStorageKey(STORAGE_KEY_NAMES.NOTES);
}

function getCategoriesStorageKey(): string {
  return getNamespacedStorageKey(STORAGE_KEY_NAMES.CATEGORIES);
}

function getSyncQueueStorageKey(): string {
  return getNamespacedStorageKey(STORAGE_KEY_NAMES.SYNC_QUEUE);
}

export enum SyncOperation {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  Archive = 'ARCHIVE',
  Restore = 'RESTORE',
  Trash = 'TRASH',
  Move = 'MOVE',
}

export interface SyncQueueItem {
  id: string;
  entityType: 'note' | 'category';
  entityId: string;
  operation: SyncOperation;
  payload: string;
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

interface LocalNote extends Note {
  isLocal?: boolean;
  serverId?: string | null;
}

interface LocalCategory extends Category {
  isLocal?: boolean;
  serverId?: string | null;
}

type SyncQueueEntityType = SyncQueueItem['entityType'];

function buildQueuedNoteSnapshot(note: LocalNote): Record<string, unknown> {
  return {
    content: note.content,
    categoryId: note.categoryId,
    deviceId: note.deviceId,
    status: note.status,
  };
}

function buildQueuedCategorySnapshot(category: LocalCategory): Record<string, unknown> {
  return {
    name: category.name,
    color: category.color,
    icon: category.icon,
    sortOrder: category.sortOrder,
  };
}

async function readSyncQueueItems(): Promise<SyncQueueItem[]> {
  const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
  return data ? JSON.parse(data) : [];
}

async function writeSyncQueueItems(queue: SyncQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(queue));
}

async function rewriteQueuedCreateSnapshot(
  entityType: SyncQueueEntityType,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const queue = await readSyncQueueItems();
  let changed = false;

  const updatedQueue = queue.map((item) => {
    if (item.entityType === entityType && item.entityId === entityId && item.operation === SyncOperation.Create) {
      changed = true;
      return {
        ...item,
        payload: JSON.stringify(payload),
      };
    }

    return item;
  });

  if (changed) {
    await writeSyncQueueItems(updatedQueue);
  }
}

async function cancelQueuedCreateSnapshot(entityType: SyncQueueEntityType, entityId: string): Promise<void> {
  const queue = await readSyncQueueItems();
  const filtered = queue.filter(
    (item) => !(item.entityType === entityType && item.entityId === entityId && item.operation === SyncOperation.Create)
  );

  if (filtered.length !== queue.length) {
    await writeSyncQueueItems(filtered);
  }
}

export async function remapLocalCategoryReferences(
  fromCategoryId: string,
  toCategoryId: string
): Promise<void> {
  try {
    const notesData = await AsyncStorage.getItem(getNotesStorageKey());
    const notes: LocalNote[] = notesData ? JSON.parse(notesData) : [];
    let notesChanged = false;

    const remappedNotes = notes.map((note) => {
      if (note.categoryId === fromCategoryId) {
        notesChanged = true;
        return {
          ...note,
          categoryId: toCategoryId,
        };
      }

      return note;
    });

    if (notesChanged) {
      await AsyncStorage.setItem(getNotesStorageKey(), JSON.stringify(remappedNotes));
    }

    const queue = await readSyncQueueItems();
    let queueChanged = false;

    const remappedQueue = queue.map((item) => {
      if (item.entityType !== 'note') {
        return item;
      }

      try {
        const payload = item.payload ? JSON.parse(item.payload) : null;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.categoryId !== fromCategoryId) {
          return item;
        }

        queueChanged = true;
        return {
          ...item,
          payload: JSON.stringify({
            ...payload,
            categoryId: toCategoryId,
          }),
        };
      } catch {
        return item;
      }
    });

    if (queueChanged) {
      await writeSyncQueueItems(remappedQueue);
    }
  } catch (error) {
    console.error('Failed to remap local category references:', error);
  }
}

// Note operations
export async function getLocalNotes(params: {
  status?: NoteStatus;
  categoryId?: string;
}): Promise<Note[]> {
  try {
    const data = await AsyncStorage.getItem(getNotesStorageKey());
    const notes: LocalNote[] = data ? JSON.parse(data) : [];

    let filtered = notes;

    if (params.status !== undefined) {
      filtered = filtered.filter((n) => n.status === params.status);
    }

    if (params.categoryId !== undefined) {
      if (params.categoryId === null || params.categoryId === '') {
        filtered = filtered.filter((n) => !n.categoryId);
      } else {
        filtered = filtered.filter((n) => n.categoryId === params.categoryId);
      }
    }

    // Sort by updatedAt descending
    filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return filtered;
  } catch (error) {
    console.error('Failed to get local notes:', error);
    return [];
  }
}

export async function getLocalNote(id: string): Promise<Note | null> {
  try {
    const data = await AsyncStorage.getItem(getNotesStorageKey());
    const notes: LocalNote[] = data ? JSON.parse(data) : [];
    return notes.find((n) => n.id === id) || null;
  } catch (error) {
    console.error('Failed to get local note:', error);
    return null;
  }
}

export async function saveLocalNote(note: Note, isLocal = false): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getNotesStorageKey());
    const notes: LocalNote[] = data ? JSON.parse(data) : [];

    const existingIndex = notes.findIndex((n) => n.id === note.id);
    const localNote: LocalNote = {
      ...note,
      isLocal,
      serverId: isLocal ? null : note.id,
    };

    if (existingIndex >= 0) {
      notes[existingIndex] = localNote;
    } else {
      notes.push(localNote);
    }

    await AsyncStorage.setItem(getNotesStorageKey(), JSON.stringify(notes));

    if (isLocal) {
      await rewriteQueuedCreateSnapshot('note', note.id, buildQueuedNoteSnapshot(localNote));
    }
  } catch (error) {
    console.error('Failed to save local note:', error);
  }
}

export async function deleteLocalNote(id: string): Promise<void> {
  try {
    await cancelQueuedCreateSnapshot('note', id);

    const data = await AsyncStorage.getItem(getNotesStorageKey());
    const notes: LocalNote[] = data ? JSON.parse(data) : [];
    const filtered = notes.filter((n) => n.id !== id);
    await AsyncStorage.setItem(getNotesStorageKey(), JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete local note:', error);
  }
}

export async function bulkSaveNotes(notes: Note[]): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getNotesStorageKey());
    const existingNotes: LocalNote[] = data ? JSON.parse(data) : [];

    // Create a map for faster lookup
    const noteMap = new Map<string, LocalNote>();
    existingNotes.forEach((n) => noteMap.set(n.id, n));

    // Update or add notes
    for (const note of notes) {
      const existing = noteMap.get(note.id);
      if (existing) {
        // Only update if server version is newer and it's not a local-only note
        if (note.version >= existing.version && !existing.isLocal) {
          noteMap.set(note.id, { ...note, isLocal: false, serverId: note.id });
        }
      } else {
        noteMap.set(note.id, { ...note, isLocal: false, serverId: note.id });
      }
    }

    await AsyncStorage.setItem(getNotesStorageKey(), JSON.stringify(Array.from(noteMap.values())));
  } catch (error) {
    console.error('Failed to bulk save notes:', error);
  }
}

// Category operations
export async function getLocalCategories(): Promise<Category[]> {
  try {
    const data = await AsyncStorage.getItem(getCategoriesStorageKey());
    const categories: LocalCategory[] = data ? JSON.parse(data) : [];
    categories.sort((a, b) => a.sortOrder - b.sortOrder);
    return categories;
  } catch (error) {
    console.error('Failed to get local categories:', error);
    return [];
  }
}

export async function saveLocalCategory(category: Category, isLocal = false): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getCategoriesStorageKey());
    const categories: LocalCategory[] = data ? JSON.parse(data) : [];

    const existingIndex = categories.findIndex((c) => c.id === category.id);
    const localCategory: LocalCategory = {
      ...category,
      isLocal,
      serverId: isLocal ? null : category.id,
    };

    if (existingIndex >= 0) {
      categories[existingIndex] = localCategory;
    } else {
      categories.push(localCategory);
    }

    await AsyncStorage.setItem(getCategoriesStorageKey(), JSON.stringify(categories));

    if (isLocal) {
      await rewriteQueuedCreateSnapshot('category', category.id, buildQueuedCategorySnapshot(localCategory));
    }
  } catch (error) {
    console.error('Failed to save local category:', error);
  }
}

export async function deleteLocalCategory(id: string): Promise<void> {
  try {
    await cancelQueuedCreateSnapshot('category', id);

    const data = await AsyncStorage.getItem(getCategoriesStorageKey());
    const categories: LocalCategory[] = data ? JSON.parse(data) : [];
    const filtered = categories.filter((c) => c.id !== id);
    await AsyncStorage.setItem(getCategoriesStorageKey(), JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete local category:', error);
  }
}

export async function bulkSaveCategories(categories: Category[]): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getCategoriesStorageKey());
    const existingCategories: LocalCategory[] = data ? JSON.parse(data) : [];

    const categoryMap = new Map<string, LocalCategory>();
    existingCategories.forEach((c) => categoryMap.set(c.id, c));

    for (const category of categories) {
      const existing = categoryMap.get(category.id);
      if (!existing || !existing.isLocal) {
        categoryMap.set(category.id, { ...category, isLocal: false, serverId: category.id });
      }
    }

    await AsyncStorage.setItem(getCategoriesStorageKey(), JSON.stringify(Array.from(categoryMap.values())));
  } catch (error) {
    console.error('Failed to bulk save categories:', error);
  }
}

// Sync queue operations
export async function addToSyncQueue(
  item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'lastError'>
): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
    let queue: SyncQueueItem[] = data ? JSON.parse(data) : [];

    // Remove any existing pending operations for the same entity with same operation
    queue = queue.filter(
      (q) => !(q.entityType === item.entityType && q.entityId === item.entityId && q.operation === item.operation)
    );

    const newItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    queue.push(newItem);
    await AsyncStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to add to sync queue:', error);
  }
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    queue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return queue;
  } catch (error) {
    console.error('Failed to get sync queue:', error);
    return [];
  }
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    const filtered = queue.filter((q) => q.id !== id);
    await AsyncStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove sync queue item:', error);
  }
}

export async function updateSyncQueueItemError(id: string, error: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    const index = queue.findIndex((q) => q.id === id);
    if (index >= 0) {
      queue[index].retryCount += 1;
      queue[index].lastError = error;
      await AsyncStorage.setItem(getSyncQueueStorageKey(), JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Failed to update sync queue item error:', error);
  }
}

export async function getSyncQueueCount(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(getSyncQueueStorageKey());
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    return queue.length;
  } catch (error) {
    console.error('Failed to get sync queue count:', error);
    return 0;
  }
}

export async function clearLocalData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      getNotesStorageKey(),
      getCategoriesStorageKey(),
      getSyncQueueStorageKey(),
    ]);
  } catch (error) {
    console.error('Failed to clear local data:', error);
  }
}

export async function clearSyncQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(getSyncQueueStorageKey());
  } catch (error) {
    console.error('Failed to clear sync queue:', error);
  }
}

// Helper functions
export async function getInboxCount(): Promise<number> {
  try {
    const notes = await getLocalNotes({ status: NoteStatus.Inbox });
    return notes.filter((n) => !n.categoryId).length;
  } catch (error) {
    console.error('Failed to get inbox count:', error);
    return 0;
  }
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  try {
    const notes = await getLocalNotes({ status: NoteStatus.Inbox });
    const counts: Record<string, number> = {};
    notes.forEach((note) => {
      if (note.categoryId) {
        counts[note.categoryId] = (counts[note.categoryId] || 0) + 1;
      }
    });
    return counts;
  } catch (error) {
    console.error('Failed to get category counts:', error);
    return {};
  }
}
