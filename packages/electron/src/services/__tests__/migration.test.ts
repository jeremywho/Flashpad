import { createMockStore, installMockElectron } from './test-helpers';

const mockInitSqlJs = jest.fn();

jest.mock('sql.js', () => ({
  __esModule: true,
  default: mockInitSqlJs,
}));

import initSqlJs from 'sql.js';

const initSqlJsMock = initSqlJs as unknown as jest.MockedFunction<typeof initSqlJs>;

class FakeDatabase {
  close = jest.fn();

  exec(sql: string) {
    if (sql.includes('FROM notes')) {
      return [
        {
          columns: [
            'id',
            'content',
            'category_id',
            'status',
            'version',
            'device_id',
            'created_at',
            'updated_at',
            'is_local',
            'server_id',
          ],
          values: [
            ['note-1', 'Legacy note content', 'category-1', 0, 3, 'device-1', '2026-04-12T00:00:00.000Z', '2026-04-12T00:00:00.000Z', 1, null],
          ],
        },
      ];
    }

    if (sql.includes('FROM categories')) {
      return [
        {
          columns: ['id', 'name', 'color', 'icon', 'sort_order', 'created_at', 'updated_at', 'is_local', 'server_id'],
          values: [
            ['category-1', 'Legacy category', '#123456', null, 1, '2026-04-12T00:00:00.000Z', '2026-04-12T00:00:00.000Z', 1, null],
          ],
        },
      ];
    }

    if (sql.includes('FROM sync_queue')) {
      return [
        {
          columns: [
            'id',
            'entity_type',
            'entity_id',
            'operation',
            'payload',
            'base_version',
            'created_at',
            'retry_count',
            'last_error',
          ],
          values: [
            [7, 'note', 'note-1', 'UPDATE', '{"content":"Legacy note content"}', 3, '2026-04-12T00:00:00.000Z', 0, null],
          ],
        },
      ];
    }

    return [];
  }
}

describe('migration', () => {
  beforeEach(() => {
    jest.resetModules();
    initSqlJsMock.mockReset();

    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    if (typeof globalThis.atob !== 'function') {
      Object.defineProperty(globalThis, 'atob', {
        configurable: true,
        value: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      });
    }

    const mockStore = createMockStore();
    installMockElectron(mockStore);
  });

  it('uses the packaged sql.js wasm asset instead of the network host', async () => {
    initSqlJsMock.mockResolvedValue({ Database: FakeDatabase } as never);

    const { migrateFromLocalStorage } = await import('../migration');

    localStorage.setItem('flashpad_local_db', 'c2VydmVyLWJ5dGVz');

    await migrateFromLocalStorage();

    expect(initSqlJsMock).toHaveBeenCalledWith({
      locateFile: expect.any(Function),
    });

    const locateFile = initSqlJsMock.mock.calls[0]?.[0]?.locateFile as ((file: string) => string) | undefined;
    expect(locateFile).toBeDefined();
    if (!locateFile) {
      throw new Error('locateFile callback was not passed to sql.js');
    }
    expect(locateFile('sql-wasm.wasm')).toBe('/mock/sql-wasm.wasm');
    expect(locateFile('other-file.dat')).toBe('other-file.dat');
    expect(window.electron.fs.writeNote).toHaveBeenCalledWith(
      'note-1',
      expect.stringContaining('Legacy note content')
    );
    expect(localStorage.getItem('flashpad_migration_done_v1')).toEqual(expect.any(String));
    expect(localStorage.getItem('flashpad_local_db')).toBeNull();
  });
});
