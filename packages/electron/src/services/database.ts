import initSqlJs, { Database } from 'sql.js';
import { Note, Category, NoteStatus } from '@shared/index';

let db: Database | null = null;
let dbInitialized = false;

const DB_KEY = 'flashpad_local_db';

export interface LocalNote {
  id: string;
  content: string;
  categoryId: string | null;
  status: NoteStatus;
  version: number;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean; // true if created offline and not yet synced
  serverId: string | null; // server ID once synced
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
  payload: string; // JSON stringified data
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

async function initDatabase(): Promise<Database> {
  if (db && dbInitialized) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  // Try to load existing database from localStorage
  const savedDb = localStorage.getItem(DB_KEY);
  if (savedDb) {
    const data = Uint8Array.from(atob(savedDb), (c) => c.charCodeAt(0));
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
    createTables(db);
  }

  dbInitialized = true;
  return db;
}

function createTables(database: Database): void {
  // Notes table
  database.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category_id TEXT,
      status INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      device_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_local INTEGER NOT NULL DEFAULT 0,
      server_id TEXT
    )
  `);

  // Categories table
  database.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_local INTEGER NOT NULL DEFAULT 0,
      server_id TEXT
    )
  `);

  // Sync queue table
  database.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      base_version INTEGER,
      created_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `);

  // Index for faster lookups
  database.run('CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status)');
  database.run('CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id)');
}

function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const base64 = btoa(String.fromCharCode(...data));
  localStorage.setItem(DB_KEY, base64);
}

// Note operations
export async function getLocalNotes(params: {
  status?: NoteStatus;
  categoryId?: string;
}): Promise<Note[]> {
  const database = await initDatabase();

  let sql = 'SELECT * FROM notes WHERE 1=1';
  const sqlParams: (number | string)[] = [];

  if (params.status !== undefined) {
    sql += ' AND status = ?';
    sqlParams.push(params.status);
  }

  if (params.categoryId !== undefined) {
    if (params.categoryId === null || params.categoryId === '') {
      sql += ' AND category_id IS NULL';
    } else {
      sql += ' AND category_id = ?';
      sqlParams.push(params.categoryId);
    }
  }

  sql += ' ORDER BY updated_at DESC';

  const results = database.exec(sql, sqlParams);
  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map((row: unknown[]) => rowToNote(columns, row));
}

export async function getLocalNote(id: string): Promise<Note | null> {
  const database = await initDatabase();
  const results = database.exec('SELECT * FROM notes WHERE id = ?', [id]);
  if (results.length === 0 || results[0].values.length === 0) return null;
  return rowToNote(results[0].columns, results[0].values[0]);
}

export async function saveLocalNote(note: Note, isLocal = false): Promise<void> {
  const database = await initDatabase();

  const existing = await getLocalNote(note.id);

  if (existing) {
    database.run(
      `UPDATE notes SET
        content = ?, category_id = ?, status = ?, version = ?,
        device_id = ?, updated_at = ?, is_local = ?, server_id = ?
      WHERE id = ?`,
      [
        note.content,
        note.categoryId || null,
        note.status,
        note.version,
        note.deviceId || null,
        note.updatedAt,
        isLocal ? 1 : 0,
        isLocal ? null : note.id,
        note.id,
      ]
    );
  } else {
    database.run(
      `INSERT INTO notes (id, content, category_id, status, version, device_id, created_at, updated_at, is_local, server_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.content,
        note.categoryId || null,
        note.status,
        note.version,
        note.deviceId || null,
        note.createdAt,
        note.updatedAt,
        isLocal ? 1 : 0,
        isLocal ? null : note.id,
      ]
    );
  }

  saveDatabase();
}

export async function deleteLocalNote(id: string): Promise<void> {
  const database = await initDatabase();
  database.run('DELETE FROM notes WHERE id = ?', [id]);
  saveDatabase();
}

export async function bulkSaveNotes(notes: Note[]): Promise<void> {
  const database = await initDatabase();

  for (const note of notes) {
    const existing = await getLocalNote(note.id);

    if (existing) {
      // Only update if server version is newer or same
      if (note.version >= existing.version) {
        database.run(
          `UPDATE notes SET
            content = ?, category_id = ?, status = ?, version = ?,
            device_id = ?, updated_at = ?, server_id = ?
          WHERE id = ? AND is_local = 0`,
          [
            note.content,
            note.categoryId || null,
            note.status,
            note.version,
            note.deviceId || null,
            note.updatedAt,
            note.id,
            note.id,
          ]
        );
      }
    } else {
      database.run(
        `INSERT INTO notes (id, content, category_id, status, version, device_id, created_at, updated_at, is_local, server_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          note.id,
          note.content,
          note.categoryId || null,
          note.status,
          note.version,
          note.deviceId || null,
          note.createdAt,
          note.updatedAt,
          note.id,
        ]
      );
    }
  }

  saveDatabase();
}

// Category operations
export async function getLocalCategories(): Promise<Category[]> {
  const database = await initDatabase();
  const results = database.exec('SELECT * FROM categories ORDER BY sort_order ASC');
  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map((row: unknown[]) => rowToCategory(columns, row));
}

export async function saveLocalCategory(category: Category, isLocal = false): Promise<void> {
  const database = await initDatabase();

  const results = database.exec('SELECT id FROM categories WHERE id = ?', [category.id]);
  const existing = results.length > 0 && results[0].values.length > 0;

  if (existing) {
    database.run(
      `UPDATE categories SET
        name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ?, is_local = ?, server_id = ?
      WHERE id = ?`,
      [
        category.name,
        category.color,
        category.icon || null,
        category.sortOrder,
        category.updatedAt,
        isLocal ? 1 : 0,
        isLocal ? null : category.id,
        category.id,
      ]
    );
  } else {
    database.run(
      `INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at, is_local, server_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.name,
        category.color,
        category.icon || null,
        category.sortOrder,
        category.createdAt,
        category.updatedAt,
        isLocal ? 1 : 0,
        isLocal ? null : category.id,
      ]
    );
  }

  saveDatabase();
}

export async function deleteLocalCategory(id: string): Promise<void> {
  const database = await initDatabase();
  database.run('DELETE FROM categories WHERE id = ?', [id]);
  saveDatabase();
}

export async function bulkSaveCategories(categories: Category[]): Promise<void> {
  const database = await initDatabase();

  for (const category of categories) {
    const results = database.exec('SELECT id FROM categories WHERE id = ?', [category.id]);
    const existing = results.length > 0 && results[0].values.length > 0;

    if (existing) {
      database.run(
        `UPDATE categories SET
          name = ?, color = ?, icon = ?, sort_order = ?, updated_at = ?, server_id = ?
        WHERE id = ? AND is_local = 0`,
        [
          category.name,
          category.color,
          category.icon || null,
          category.sortOrder,
          category.updatedAt,
          category.id,
          category.id,
        ]
      );
    } else {
      database.run(
        `INSERT INTO categories (id, name, color, icon, sort_order, created_at, updated_at, is_local, server_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          category.id,
          category.name,
          category.color,
          category.icon || null,
          category.sortOrder,
          category.createdAt,
          category.updatedAt,
          category.id,
        ]
      );
    }
  }

  saveDatabase();
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'lastError'>): Promise<void> {
  const database = await initDatabase();

  // Remove any existing pending operations for the same entity
  database.run(
    'DELETE FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND operation = ?',
    [item.entityType, item.entityId, item.operation]
  );

  database.run(
    `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, base_version, created_at, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [
      item.entityType,
      item.entityId,
      item.operation,
      item.payload,
      item.baseVersion || null,
      new Date().toISOString(),
    ]
  );

  saveDatabase();
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const database = await initDatabase();
  const results = database.exec('SELECT * FROM sync_queue ORDER BY created_at ASC');
  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col: string, i: number) => {
      obj[col] = row[i];
    });
    return {
      id: obj.id as number,
      entityType: obj.entity_type as 'note' | 'category',
      entityId: obj.entity_id as string,
      operation: obj.operation as SyncOperation,
      payload: obj.payload as string,
      baseVersion: obj.base_version as number | null,
      createdAt: obj.created_at as string,
      retryCount: obj.retry_count as number,
      lastError: obj.last_error as string | null,
    };
  });
}

export async function removeSyncQueueItem(id: number): Promise<void> {
  const database = await initDatabase();
  database.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  saveDatabase();
}

export async function updateSyncQueueItemError(id: number, error: string): Promise<void> {
  const database = await initDatabase();
  database.run(
    'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
    [error, id]
  );
  saveDatabase();
}

export async function getSyncQueueCount(): Promise<number> {
  const database = await initDatabase();
  const results = database.exec('SELECT COUNT(*) as count FROM sync_queue');
  if (results.length === 0) return 0;
  return results[0].values[0][0] as number;
}

export async function clearLocalData(): Promise<void> {
  const database = await initDatabase();
  database.run('DELETE FROM notes');
  database.run('DELETE FROM categories');
  database.run('DELETE FROM sync_queue');
  saveDatabase();
}

// Helper functions
function rowToNote(columns: string[], row: unknown[]): Note {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });

  return {
    id: obj.id as string,
    content: obj.content as string,
    categoryId: obj.category_id as string | undefined,
    status: obj.status as NoteStatus,
    version: obj.version as number,
    deviceId: obj.device_id as string | undefined,
    createdAt: obj.created_at as string,
    updatedAt: obj.updated_at as string,
  };
}

function rowToCategory(columns: string[], row: unknown[]): Category {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });

  return {
    id: obj.id as string,
    name: obj.name as string,
    color: obj.color as string,
    icon: obj.icon as string | undefined,
    sortOrder: obj.sort_order as number,
    noteCount: 0, // Will be calculated from notes
    createdAt: obj.created_at as string,
    updatedAt: obj.updated_at as string,
  };
}

// Get note counts for categories
export async function getCategoryCounts(): Promise<Record<string, number>> {
  const database = await initDatabase();
  const results = database.exec(
    'SELECT category_id, COUNT(*) as count FROM notes WHERE status = 0 AND category_id IS NOT NULL GROUP BY category_id'
  );

  const counts: Record<string, number> = {};
  if (results.length > 0) {
    results[0].values.forEach((row: unknown[]) => {
      counts[row[0] as string] = row[1] as number;
    });
  }
  return counts;
}

export async function getInboxCount(): Promise<number> {
  const database = await initDatabase();
  const results = database.exec(
    'SELECT COUNT(*) FROM notes WHERE status = 0 AND category_id IS NULL'
  );
  if (results.length === 0) return 0;
  return results[0].values[0][0] as number;
}
