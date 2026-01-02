import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note, Category, NoteStatus } from '@flashpad/shared';

const STORAGE_KEYS = {
  NOTES: 'flashpad_notes',
  CATEGORIES: 'flashpad_categories',
  SYNC_QUEUE: 'flashpad_sync_queue',
};

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

// Note operations
export async function getLocalNotes(params: {
  status?: NoteStatus;
  categoryId?: string;
}): Promise<Note[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
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
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
    const notes: LocalNote[] = data ? JSON.parse(data) : [];
    return notes.find((n) => n.id === id) || null;
  } catch (error) {
    console.error('Failed to get local note:', error);
    return null;
  }
}

export async function saveLocalNote(note: Note, isLocal = false): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
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

    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  } catch (error) {
    console.error('Failed to save local note:', error);
  }
}

export async function deleteLocalNote(id: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
    const notes: LocalNote[] = data ? JSON.parse(data) : [];
    const filtered = notes.filter((n) => n.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete local note:', error);
  }
}

export async function bulkSaveNotes(notes: Note[]): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.NOTES);
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

    await AsyncStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(Array.from(noteMap.values())));
  } catch (error) {
    console.error('Failed to bulk save notes:', error);
  }
}

// Category operations
export async function getLocalCategories(): Promise<Category[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
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
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
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

    await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  } catch (error) {
    console.error('Failed to save local category:', error);
  }
}

export async function deleteLocalCategory(id: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
    const categories: LocalCategory[] = data ? JSON.parse(data) : [];
    const filtered = categories.filter((c) => c.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete local category:', error);
  }
}

export async function bulkSaveCategories(categories: Category[]): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
    const existingCategories: LocalCategory[] = data ? JSON.parse(data) : [];

    const categoryMap = new Map<string, LocalCategory>();
    existingCategories.forEach((c) => categoryMap.set(c.id, c));

    for (const category of categories) {
      const existing = categoryMap.get(category.id);
      if (!existing || !existing.isLocal) {
        categoryMap.set(category.id, { ...category, isLocal: false, serverId: category.id });
      }
    }

    await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(Array.from(categoryMap.values())));
  } catch (error) {
    console.error('Failed to bulk save categories:', error);
  }
}

// Sync queue operations
export async function addToSyncQueue(
  item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'lastError'>
): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
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
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to add to sync queue:', error);
  }
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
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
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    const filtered = queue.filter((q) => q.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove sync queue item:', error);
  }
}

export async function updateSyncQueueItemError(id: string, error: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    const index = queue.findIndex((q) => q.id === id);
    if (index >= 0) {
      queue[index].retryCount += 1;
      queue[index].lastError = error;
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Failed to update sync queue item error:', error);
  }
}

export async function getSyncQueueCount(): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    const queue: SyncQueueItem[] = data ? JSON.parse(data) : [];
    return queue.length;
  } catch (error) {
    console.error('Failed to get sync queue count:', error);
    return 0;
  }
}

export async function clearLocalData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEYS.NOTES, STORAGE_KEYS.CATEGORIES, STORAGE_KEYS.SYNC_QUEUE]);
  } catch (error) {
    console.error('Failed to clear local data:', error);
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
