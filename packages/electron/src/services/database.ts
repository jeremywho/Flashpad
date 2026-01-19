import { Note, Category, NoteStatus } from '@shared/index';
import {
  parseNoteFile,
  serializeNote,
  extractIdFromFilename,
  NoteMetadata,
} from './markdown-parser';

// In-memory cache for notes and categories
let notesCache: Map<string, LocalNote> = new Map();
let categoriesCache: Map<string, LocalCategory> = new Map();
let syncQueueCache: SyncQueueItem[] = [];
let initialized = false;

// Track which note IDs are being written to avoid reacting to our own file changes
const writingNotes: Set<string> = new Set();

export interface LocalNote {
  id: string;
  content: string;
  categoryId: string | null;
  status: NoteStatus;
  version: number;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean;
  serverId: string | null;
}

export interface LocalCategory {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean;
  serverId: string | null;
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
  id: number;
  entityType: 'note' | 'category';
  entityId: string;
  operation: SyncOperation;
  payload: string;
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

interface CategoriesFile {
  categories: LocalCategory[];
}

interface SyncQueueFile {
  items: SyncQueueItem[];
  nextId: number;
}

// Initialize database from file system
async function initDatabase(): Promise<void> {
  if (initialized) return;

  try {
    await window.electron.fs.ensureDataDir();

    // Load notes from files
    await loadNotesFromFiles();

    // Load categories from JSON
    await loadCategoriesFromFile();

    // Load sync queue from JSON
    await loadSyncQueueFromFile();

    initialized = true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function loadNotesFromFiles(): Promise<void> {
  notesCache.clear();

  const files = await window.electron.fs.listNotes();

  for (const filename of files) {
    const id = extractIdFromFilename(filename);
    const content = await window.electron.fs.readNote(id);

    if (content) {
      const parsed = parseNoteFile(content);
      if (parsed) {
        const note: LocalNote = {
          id: parsed.metadata.id,
          content: parsed.content,
          categoryId: parsed.metadata.categoryId,
          status: parsed.metadata.status,
          version: parsed.metadata.version,
          deviceId: parsed.metadata.deviceId,
          createdAt: parsed.metadata.createdAt,
          updatedAt: parsed.metadata.updatedAt,
          isLocal: parsed.metadata.isLocal,
          serverId: parsed.metadata.serverId,
        };
        notesCache.set(note.id, note);
      }
    }
  }
}

async function loadCategoriesFromFile(): Promise<void> {
  categoriesCache.clear();

  const data = await window.electron.fs.readJsonFile<CategoriesFile>('categories.json');
  if (data && Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      categoriesCache.set(cat.id, cat);
    }
  }
}

async function saveCategoriesFile(): Promise<void> {
  const data: CategoriesFile = {
    categories: Array.from(categoriesCache.values()),
  };
  await window.electron.fs.writeJsonFile('categories.json', data);
}

async function loadSyncQueueFromFile(): Promise<void> {
  syncQueueCache = [];

  const data = await window.electron.fs.readJsonFile<SyncQueueFile>('sync-queue.json');
  if (data && Array.isArray(data.items)) {
    syncQueueCache = data.items;
  }
}

async function saveSyncQueueFile(): Promise<void> {
  const nextId =
    syncQueueCache.length > 0 ? Math.max(...syncQueueCache.map((i) => i.id)) + 1 : 1;
  const data: SyncQueueFile = {
    items: syncQueueCache,
    nextId,
  };
  await window.electron.fs.writeJsonFile('sync-queue.json', data);
}

async function writeNoteFile(note: LocalNote): Promise<void> {
  const metadata: NoteMetadata = {
    id: note.id,
    categoryId: note.categoryId,
    status: note.status,
    version: note.version,
    deviceId: note.deviceId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isLocal: note.isLocal,
    serverId: note.serverId,
  };

  const fileContent = serializeNote(metadata, note.content);
  writingNotes.add(note.id);
  try {
    await window.electron.fs.writeNote(note.id, fileContent);
  } finally {
    // Remove from writing set after a short delay to account for file system events
    setTimeout(() => writingNotes.delete(note.id), 500);
  }
}

// Note operations
export async function getLocalNotes(params: {
  status?: NoteStatus;
  categoryId?: string;
}): Promise<Note[]> {
  await initDatabase();

  let notes = Array.from(notesCache.values());

  if (params.status !== undefined) {
    notes = notes.filter((n) => n.status === params.status);
  }

  if (params.categoryId !== undefined) {
    if (params.categoryId === null || params.categoryId === '') {
      notes = notes.filter((n) => n.categoryId === null);
    } else {
      notes = notes.filter((n) => n.categoryId === params.categoryId);
    }
  }

  // Sort by updatedAt descending
  notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return notes.map(localNoteToNote);
}

export async function getLocalNote(id: string): Promise<Note | null> {
  await initDatabase();

  const note = notesCache.get(id);
  return note ? localNoteToNote(note) : null;
}

export async function saveLocalNote(note: Note, isLocal = false): Promise<void> {
  await initDatabase();

  const existing = notesCache.get(note.id);

  const localNote: LocalNote = {
    id: note.id,
    content: note.content,
    categoryId: note.categoryId || null,
    status: note.status,
    version: note.version,
    deviceId: note.deviceId || '',
    createdAt: existing?.createdAt || note.createdAt,
    updatedAt: note.updatedAt,
    isLocal: isLocal,
    serverId: isLocal ? null : note.id,
  };

  notesCache.set(note.id, localNote);
  await writeNoteFile(localNote);
}

export async function deleteLocalNote(id: string): Promise<void> {
  await initDatabase();

  notesCache.delete(id);
  await window.electron.fs.deleteNote(id);
}

export async function bulkSaveNotes(notes: Note[]): Promise<void> {
  await initDatabase();

  for (const note of notes) {
    const existing = notesCache.get(note.id);

    if (existing) {
      // Only update if server version is newer or same, and note is not local
      if (note.version >= existing.version && !existing.isLocal) {
        const localNote: LocalNote = {
          ...existing,
          content: note.content,
          categoryId: note.categoryId || null,
          status: note.status,
          version: note.version,
          deviceId: note.deviceId || '',
          updatedAt: note.updatedAt,
          serverId: note.id,
        };
        notesCache.set(note.id, localNote);
        await writeNoteFile(localNote);
      }
    } else {
      const localNote: LocalNote = {
        id: note.id,
        content: note.content,
        categoryId: note.categoryId || null,
        status: note.status,
        version: note.version,
        deviceId: note.deviceId || '',
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        isLocal: false,
        serverId: note.id,
      };
      notesCache.set(note.id, localNote);
      await writeNoteFile(localNote);
    }
  }
}

// Category operations
export async function getLocalCategories(): Promise<Category[]> {
  await initDatabase();

  const categories = Array.from(categoriesCache.values());
  categories.sort((a, b) => a.sortOrder - b.sortOrder);

  return categories.map(localCategoryToCategory);
}

export async function saveLocalCategory(category: Category, isLocal = false): Promise<void> {
  await initDatabase();

  const existing = categoriesCache.get(category.id);

  const localCategory: LocalCategory = {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon || null,
    sortOrder: category.sortOrder,
    createdAt: existing?.createdAt || category.createdAt,
    updatedAt: category.updatedAt,
    isLocal: isLocal,
    serverId: isLocal ? null : category.id,
  };

  categoriesCache.set(category.id, localCategory);
  await saveCategoriesFile();
}

export async function deleteLocalCategory(id: string): Promise<void> {
  await initDatabase();

  categoriesCache.delete(id);
  await saveCategoriesFile();
}

export async function bulkSaveCategories(categories: Category[]): Promise<void> {
  await initDatabase();

  for (const category of categories) {
    const existing = categoriesCache.get(category.id);

    if (existing) {
      // Only update if not a local category
      if (!existing.isLocal) {
        const localCategory: LocalCategory = {
          ...existing,
          name: category.name,
          color: category.color,
          icon: category.icon || null,
          sortOrder: category.sortOrder,
          updatedAt: category.updatedAt,
          serverId: category.id,
        };
        categoriesCache.set(category.id, localCategory);
      }
    } else {
      const localCategory: LocalCategory = {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon || null,
        sortOrder: category.sortOrder,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
        isLocal: false,
        serverId: category.id,
      };
      categoriesCache.set(category.id, localCategory);
    }
  }

  await saveCategoriesFile();
}

// Sync queue operations
export async function addToSyncQueue(
  item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'lastError'>
): Promise<void> {
  await initDatabase();

  // Remove any existing pending operations for the same entity with same operation
  syncQueueCache = syncQueueCache.filter(
    (i) =>
      !(
        i.entityType === item.entityType &&
        i.entityId === item.entityId &&
        i.operation === item.operation
      )
  );

  const nextId =
    syncQueueCache.length > 0 ? Math.max(...syncQueueCache.map((i) => i.id)) + 1 : 1;

  const newItem: SyncQueueItem = {
    id: nextId,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
    payload: item.payload,
    baseVersion: item.baseVersion || null,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
  };

  syncQueueCache.push(newItem);
  await saveSyncQueueFile();
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  await initDatabase();

  return [...syncQueueCache].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function removeSyncQueueItem(id: number): Promise<void> {
  await initDatabase();

  syncQueueCache = syncQueueCache.filter((i) => i.id !== id);
  await saveSyncQueueFile();
}

export async function updateSyncQueueItemError(id: number, error: string): Promise<void> {
  await initDatabase();

  const item = syncQueueCache.find((i) => i.id === id);
  if (item) {
    item.retryCount += 1;
    item.lastError = error;
    await saveSyncQueueFile();
  }
}

export async function getSyncQueueCount(): Promise<number> {
  await initDatabase();
  return syncQueueCache.length;
}

export async function clearLocalData(): Promise<void> {
  await initDatabase();

  // Delete all note files
  for (const id of notesCache.keys()) {
    await window.electron.fs.deleteNote(id);
  }

  notesCache.clear();
  categoriesCache.clear();
  syncQueueCache = [];

  await saveCategoriesFile();
  await saveSyncQueueFile();
}

// Get note counts for categories
export async function getCategoryCounts(): Promise<Record<string, number>> {
  await initDatabase();

  const counts: Record<string, number> = {};

  for (const note of notesCache.values()) {
    if (note.status === NoteStatus.Inbox && note.categoryId) {
      counts[note.categoryId] = (counts[note.categoryId] || 0) + 1;
    }
  }

  return counts;
}

export async function getInboxCount(): Promise<number> {
  await initDatabase();

  let count = 0;
  for (const note of notesCache.values()) {
    if (note.status === NoteStatus.Inbox && !note.categoryId) {
      count++;
    }
  }

  return count;
}

// Helper functions
function localNoteToNote(localNote: LocalNote): Note {
  return {
    id: localNote.id,
    content: localNote.content,
    categoryId: localNote.categoryId || undefined,
    status: localNote.status,
    version: localNote.version,
    deviceId: localNote.deviceId || undefined,
    createdAt: localNote.createdAt,
    updatedAt: localNote.updatedAt,
  };
}

function localCategoryToCategory(localCategory: LocalCategory): Category {
  return {
    id: localCategory.id,
    name: localCategory.name,
    color: localCategory.color,
    icon: localCategory.icon || undefined,
    sortOrder: localCategory.sortOrder,
    noteCount: 0, // Will be calculated from notes
    createdAt: localCategory.createdAt,
    updatedAt: localCategory.updatedAt,
  };
}

// File watcher integration
export function isWritingNote(id: string): boolean {
  return writingNotes.has(id);
}

export async function reloadNoteFromFile(id: string): Promise<Note | null> {
  const content = await window.electron.fs.readNote(id);
  if (!content) {
    // File was deleted
    notesCache.delete(id);
    return null;
  }

  const parsed = parseNoteFile(content);
  if (!parsed) {
    return null;
  }

  const note: LocalNote = {
    id: parsed.metadata.id,
    content: parsed.content,
    categoryId: parsed.metadata.categoryId,
    status: parsed.metadata.status,
    version: parsed.metadata.version,
    deviceId: parsed.metadata.deviceId,
    createdAt: parsed.metadata.createdAt,
    updatedAt: parsed.metadata.updatedAt,
    isLocal: parsed.metadata.isLocal,
    serverId: parsed.metadata.serverId,
  };

  notesCache.set(note.id, note);
  return localNoteToNote(note);
}

export async function handleFileDeleted(id: string): Promise<void> {
  notesCache.delete(id);
}

// Force reload all data (useful after changing data directory)
export async function reloadAllData(): Promise<void> {
  initialized = false;
  notesCache.clear();
  categoriesCache.clear();
  syncQueueCache = [];
  await initDatabase();
}

// Export cache for inspection (useful for migration)
export function getNotesCache(): Map<string, LocalNote> {
  return notesCache;
}

export function getCategoriesCache(): Map<string, LocalCategory> {
  return categoriesCache;
}
