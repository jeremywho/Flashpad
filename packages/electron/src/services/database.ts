import { Note, Category, NoteStatus } from '@shared/index';
import {
  parseNoteFile,
  serializeNote,
  extractIdFromFilename,
  createDefaultMetadata,
  normalizeNoteId,
  isValidNoteId,
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

function getNextSyncQueueId(): number {
  return syncQueueCache.length > 0 ? Math.max(...syncQueueCache.map((i) => i.id)) + 1 : 1;
}

function parseSyncQueuePayload(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function buildNoteCreatePayload(
  note: LocalNote,
  existingPayload: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...existingPayload };
  payload.content = note.content;

  if (note.categoryId) {
    payload.categoryId = note.categoryId;
  } else {
    delete payload.categoryId;
  }

  if (note.deviceId) {
    payload.deviceId = note.deviceId;
  }

  return payload;
}

function buildCategoryCreatePayload(
  category: LocalCategory,
  existingPayload: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...existingPayload };
  payload.name = category.name;
  payload.color = category.color;

  if (category.icon) {
    payload.icon = category.icon;
  } else {
    delete payload.icon;
  }

  return payload;
}

function upsertPendingCreateSnapshot(
  entityType: 'note' | 'category',
  entityId: string,
  payloadBuilder: (existingPayload: Record<string, unknown>) => Record<string, unknown>,
  createIfMissing: boolean
): boolean {
  const existingItem = syncQueueCache.find(
    (item) =>
      item.entityType === entityType &&
      item.entityId === entityId &&
      item.operation === SyncOperation.Create
  );

  if (existingItem) {
    const nextPayload = JSON.stringify(payloadBuilder(parseSyncQueuePayload(existingItem.payload)));
    if (existingItem.payload === nextPayload && existingItem.baseVersion === null) {
      return false;
    }

    existingItem.payload = nextPayload;
    existingItem.baseVersion = null;
    return true;
  }

  if (!createIfMissing) {
    return false;
  }

  syncQueueCache.push({
    id: getNextSyncQueueId(),
    entityType,
    entityId,
    operation: SyncOperation.Create,
    payload: JSON.stringify(payloadBuilder({})),
    baseVersion: null,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
  });
  return true;
}

function removePendingCreateSnapshot(entityType: 'note' | 'category', entityId: string): boolean {
  const beforeLength = syncQueueCache.length;
  syncQueueCache = syncQueueCache.filter(
    (item) =>
      !(
        item.entityType === entityType &&
        item.entityId === entityId &&
        item.operation === SyncOperation.Create
      )
  );
  return syncQueueCache.length !== beforeLength;
}

export async function remapCategoryReferences(
  fromCategoryId: string,
  toCategoryId: string
): Promise<void> {
  await initDatabase();

  if (!fromCategoryId || !toCategoryId || fromCategoryId === toCategoryId) {
    return;
  }

  let queueChanged = false;

  for (const note of notesCache.values()) {
    if (note.categoryId !== fromCategoryId) {
      continue;
    }

    note.categoryId = toCategoryId;
    await writeNoteFile(note);

    if (note.isLocal && !note.serverId) {
      queueChanged =
        upsertPendingCreateSnapshot(
          'note',
          note.id,
          (existingPayload) => buildNoteCreatePayload(note, existingPayload),
          false
        ) || queueChanged;
    }
  }

  for (const item of syncQueueCache) {
    if (item.entityType !== 'note') {
      continue;
    }

    if (
      item.operation !== SyncOperation.Create &&
      item.operation !== SyncOperation.Update &&
      item.operation !== SyncOperation.Move
    ) {
      continue;
    }

    const payload = parseSyncQueuePayload(item.payload);
    if (payload.categoryId === fromCategoryId) {
      payload.categoryId = toCategoryId;
      const nextPayload = JSON.stringify(payload);
      if (item.payload !== nextPayload) {
        item.payload = nextPayload;
        queueChanged = true;
      }
    }
  }

  if (queueChanged) {
    await saveSyncQueueFile();
  }
}

// Initialize database from file system
async function initDatabase(): Promise<void> {
  if (initialized) return;

  try {
    await window.electron.fs.ensureDataDir();

    // Load sync queue first (needed by loadNotesFromFiles to check for unsynced notes)
    await loadSyncQueueFromFile();

    // Load notes from files
    await loadNotesFromFiles();

    // Load categories from JSON
    await loadCategoriesFromFile();

    initialized = true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function loadNotesFromFiles(): Promise<void> {
  notesCache.clear();

  // Collect unsynced notes to queue after loading
  const unsyncedNotes: LocalNote[] = [];

  const files = await window.electron.fs.listNotes();

  for (const filename of files) {
    const id = extractIdFromFilename(filename);
    if (!id) {
      continue;
    }
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

        // Track externally created notes that need syncing
        if (note.isLocal && !note.serverId) {
          unsyncedNotes.push(note);
        }
      } else {
        // Plain markdown file without frontmatter - ingest it
        await ingestPlainMarkdown(id, content);
      }
    }
  }

  // Queue unsynced notes that don't already have a pending sync entry.
  let queueChanged = false;
  for (const note of unsyncedNotes) {
    queueChanged =
      upsertPendingCreateSnapshot(
        'note',
        note.id,
        (existingPayload) => buildNoteCreatePayload(note, existingPayload),
        true
      ) || queueChanged;
  }
  if (queueChanged) {
    await saveSyncQueueFile();
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

  let queueChanged = false;
  for (const category of categoriesCache.values()) {
    if (category.isLocal && !category.serverId) {
      queueChanged =
        upsertPendingCreateSnapshot(
          'category',
          category.id,
          (existingPayload) => buildCategoryCreatePayload(category, existingPayload),
          true
        ) || queueChanged;
    }
  }

  if (queueChanged) {
    await saveSyncQueueFile();
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
  if (!isValidNoteId(note.id)) {
    throw new Error(`Unsafe note ID: ${note.id}`);
  }

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

  const safeId = normalizeNoteId(id);
  if (!safeId) {
    return null;
  }

  const note = notesCache.get(safeId);
  return note ? localNoteToNote(note) : null;
}

export async function saveLocalNote(note: Note, isLocal = false): Promise<void> {
  await initDatabase();

  if (!isValidNoteId(note.id)) {
    throw new Error(`Unsafe note ID: ${note.id}`);
  }

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

  if (localNote.isLocal && !localNote.serverId) {
    const queueChanged = upsertPendingCreateSnapshot(
      'note',
      localNote.id,
      (existingPayload) => buildNoteCreatePayload(localNote, existingPayload),
      false
    );
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  }
}

export async function deleteLocalNote(id: string): Promise<void> {
  await initDatabase();

  const safeId = normalizeNoteId(id);
  if (!safeId) {
    return;
  }

  const existing = notesCache.get(safeId);
  notesCache.delete(safeId);
  if (existing?.isLocal && !existing.serverId) {
    const queueChanged = removePendingCreateSnapshot('note', safeId);
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  }
  writingNotes.add(safeId);
  try {
    await window.electron.fs.deleteNote(safeId);
  } finally {
    setTimeout(() => writingNotes.delete(safeId), 500);
  }
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

  if (localCategory.isLocal && !localCategory.serverId) {
    const queueChanged = upsertPendingCreateSnapshot(
      'category',
      localCategory.id,
      (existingPayload) => buildCategoryCreatePayload(localCategory, existingPayload),
      false
    );
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  }
}

export async function deleteLocalCategory(id: string): Promise<void> {
  await initDatabase();

  const existing = categoriesCache.get(id);
  categoriesCache.delete(id);
  await saveCategoriesFile();

  if (existing?.isLocal && !existing.serverId) {
    const queueChanged = removePendingCreateSnapshot('category', id);
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  }
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
  const safeId = normalizeNoteId(id);
  if (!safeId) {
    return null;
  }
  const content = await window.electron.fs.readNote(safeId);
  if (!content) {
    // File was deleted
    notesCache.delete(safeId);
    return null;
  }

  const parsed = parseNoteFile(content);
  if (!parsed) {
    // Plain markdown file without frontmatter - ingest it
    return ingestPlainMarkdown(id, content);
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

  const existing = notesCache.get(note.id);
  const isNew = !existing;
  notesCache.set(note.id, note);

  if (isNew && note.isLocal && !note.serverId) {
    // Externally created note with frontmatter that hasn't been synced yet
    const queueChanged = upsertPendingCreateSnapshot(
      'note',
      note.id,
      (existingPayload) => buildNoteCreatePayload(note, existingPayload),
      true
    );
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  } else if (!isNew && note.isLocal && !note.serverId) {
    const queueChanged = upsertPendingCreateSnapshot(
      'note',
      note.id,
      (existingPayload) => buildNoteCreatePayload(note, existingPayload),
      false
    );
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  } else if (!isNew && note.serverId) {
    // Existing synced note edited externally — queue an update if content
    // or category changed
    const contentChanged = existing.content !== note.content;
    const categoryChanged = existing.categoryId !== note.categoryId;

    if (contentChanged || categoryChanged) {
      // Update the local file's updatedAt timestamp
      note.updatedAt = new Date().toISOString();
      note.version = existing.version + 1;
      notesCache.set(note.id, note);
      await writeNoteFile(note);

      await addToSyncQueue({
        entityType: 'note',
        entityId: note.serverId,
        operation: SyncOperation.Update,
        payload: JSON.stringify({
          content: note.content,
          categoryId: note.categoryId,
        }),
        baseVersion: existing.version,
      });
    }
  }

  return localNoteToNote(note);
}

/**
 * Ingest a plain markdown file (no frontmatter) into the system.
 * Generates metadata, writes the file back with frontmatter under a new ID,
 * deletes the original file, and queues it for sync.
 */
async function ingestPlainMarkdown(originalFileId: string, content: string): Promise<Note> {
  const metadata = createDefaultMetadata();

  const note: LocalNote = {
    id: metadata.id,
    content: content.trimEnd(),
    categoryId: null,
    status: NoteStatus.Inbox,
    version: 1,
    deviceId: '',
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    isLocal: true,
    serverId: null,
  };

  // Write new file with frontmatter under the generated ID
  notesCache.set(note.id, note);
  await writeNoteFile(note);

  // Delete the original plain file
  await window.electron.fs.deleteNote(originalFileId);

  // Queue for server sync
  await addToSyncQueue({
    entityType: 'note',
    entityId: note.id,
    operation: SyncOperation.Create,
    payload: JSON.stringify({ content: note.content }),
    baseVersion: null,
  });

  return localNoteToNote(note);
}

export async function handleFileDeleted(id: string): Promise<void> {
  const safeId = normalizeNoteId(id);
  if (!safeId) {
    return;
  }

  const existing = notesCache.get(safeId);
  notesCache.delete(safeId);

  if (existing?.isLocal && !existing.serverId) {
    const queueChanged = removePendingCreateSnapshot('note', safeId);
    if (queueChanged) {
      await saveSyncQueueFile();
    }
  }

  // If the deleted note was synced to the server, queue a server-side delete
  if (existing?.serverId) {
    await addToSyncQueue({
      entityType: 'note',
      entityId: existing.serverId,
      operation: SyncOperation.Delete,
      payload: '{}',
      baseVersion: existing.version,
    });
  }
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
