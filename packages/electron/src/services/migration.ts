import initSqlJs from 'sql.js';
import { NoteStatus } from '@shared/index';
import { LocalNote, LocalCategory, SyncQueueItem, SyncOperation } from './database';
import { serializeNote, NoteMetadata } from './markdown-parser';

const OLD_DB_KEY = 'flashpad_local_db';
const MIGRATION_DONE_KEY = 'flashpad_migration_done_v1';

interface OldSyncQueueItem {
  id: number;
  entity_type: 'note' | 'category';
  entity_id: string;
  operation: string;
  payload: string;
  base_version: number | null;
  created_at: string;
  retry_count: number;
  last_error: string | null;
}

/**
 * Check if migration from localStorage is needed.
 */
export function isMigrationNeeded(): boolean {
  // If migration already done, skip
  if (localStorage.getItem(MIGRATION_DONE_KEY)) {
    return false;
  }

  // Check if old database exists
  const savedDb = localStorage.getItem(OLD_DB_KEY);
  return savedDb !== null;
}

/**
 * Migrate data from old localStorage database to new file-based storage.
 * Returns the number of notes migrated.
 */
export async function migrateFromLocalStorage(): Promise<{
  notes: number;
  categories: number;
  syncQueueItems: number;
}> {
  const savedDb = localStorage.getItem(OLD_DB_KEY);
  if (!savedDb) {
    return { notes: 0, categories: 0, syncQueueItems: 0 };
  }

  try {
    // Initialize sql.js
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    // Load old database
    const data = Uint8Array.from(atob(savedDb), (c) => c.charCodeAt(0));
    const db = new SQL.Database(data);

    // Ensure data directory exists
    await window.electron.fs.ensureDataDir();

    // Migrate notes
    const notes = extractNotes(db);
    for (const note of notes) {
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
      await window.electron.fs.writeNote(note.id, fileContent);
    }

    // Migrate categories
    const categories = extractCategories(db);
    if (categories.length > 0) {
      await window.electron.fs.writeJsonFile('categories.json', {
        categories,
      });
    }

    // Migrate sync queue
    const syncQueue = extractSyncQueue(db);
    if (syncQueue.length > 0) {
      const nextId =
        syncQueue.length > 0 ? Math.max(...syncQueue.map((i) => i.id)) + 1 : 1;
      await window.electron.fs.writeJsonFile('sync-queue.json', {
        items: syncQueue,
        nextId,
      });
    }

    // Close database
    db.close();

    // Mark migration as done
    localStorage.setItem(MIGRATION_DONE_KEY, new Date().toISOString());

    // Remove old database from localStorage
    localStorage.removeItem(OLD_DB_KEY);

    return {
      notes: notes.length,
      categories: categories.length,
      syncQueueItems: syncQueue.length,
    };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

function extractNotes(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>): LocalNote[] {
  const notes: LocalNote[] = [];

  try {
    const results = db.exec('SELECT * FROM notes');
    if (results.length === 0) return notes;

    const columns = results[0].columns;
    for (const row of results[0].values) {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });

      notes.push({
        id: obj.id as string,
        content: obj.content as string,
        categoryId: obj.category_id as string | null,
        status: obj.status as NoteStatus,
        version: obj.version as number,
        deviceId: (obj.device_id as string) || '',
        createdAt: obj.created_at as string,
        updatedAt: obj.updated_at as string,
        isLocal: obj.is_local === 1,
        serverId: obj.server_id as string | null,
      });
    }
  } catch {
    // Table might not exist
  }

  return notes;
}

function extractCategories(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>): LocalCategory[] {
  const categories: LocalCategory[] = [];

  try {
    const results = db.exec('SELECT * FROM categories ORDER BY sort_order ASC');
    if (results.length === 0) return categories;

    const columns = results[0].columns;
    for (const row of results[0].values) {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });

      categories.push({
        id: obj.id as string,
        name: obj.name as string,
        color: obj.color as string,
        icon: obj.icon as string | null,
        sortOrder: obj.sort_order as number,
        createdAt: obj.created_at as string,
        updatedAt: obj.updated_at as string,
        isLocal: obj.is_local === 1,
        serverId: obj.server_id as string | null,
      });
    }
  } catch {
    // Table might not exist
  }

  return categories;
}

function extractSyncQueue(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>): SyncQueueItem[] {
  const items: SyncQueueItem[] = [];

  try {
    const results = db.exec('SELECT * FROM sync_queue ORDER BY created_at ASC');
    if (results.length === 0) return items;

    const columns = results[0].columns;
    for (const row of results[0].values) {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });

      const oldItem = obj as unknown as OldSyncQueueItem;

      items.push({
        id: oldItem.id,
        entityType: oldItem.entity_type,
        entityId: oldItem.entity_id,
        operation: oldItem.operation as SyncOperation,
        payload: oldItem.payload,
        baseVersion: oldItem.base_version,
        createdAt: oldItem.created_at,
        retryCount: oldItem.retry_count,
        lastError: oldItem.last_error,
      });
    }
  } catch {
    // Table might not exist
  }

  return items;
}

/**
 * Clear the migration done flag (useful for testing).
 */
export function resetMigrationFlag(): void {
  localStorage.removeItem(MIGRATION_DONE_KEY);
}
