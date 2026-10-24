import {
  extractIdFromFilename,
  isAllowedDataFilename,
  isValidNoteId,
  normalizeNoteId,
  parseNoteFile,
  resolvePathWithinBaseDir,
  serializeNote,
} from '../markdown-parser';
import { NoteStatus } from '@shared/index';
import path from 'path';

describe('markdown-parser safety helpers', () => {
  it('accepts normal note ids and rejects traversal-shaped ids', () => {
    expect(isValidNoteId('local_123-abc')).toBe(true);
    expect(isValidNoteId('note_ABCDEF')).toBe(true);
    expect(isValidNoteId('../escape')).toBe(false);
    expect(isValidNoteId('note/child')).toBe(false);
    expect(isValidNoteId('note\\child')).toBe(false);
    expect(isValidNoteId('')).toBe(false);
  });

  it('normalizes safe note ids and rejects unsafe ones', () => {
    expect(normalizeNoteId('local_123-abc')).toBe('local_123-abc');
    expect(normalizeNoteId(' ../escape ')).toBeNull();
  });

  it('rejects path traversal filenames and accepts plain markdown note files', () => {
    expect(extractIdFromFilename('safe-note.md')).toBe('safe-note');
    expect(extractIdFromFilename('../escape.md')).toBeNull();
    expect(extractIdFromFilename('nested/note.md')).toBeNull();
  });

  it('keeps resolved paths under the requested base directory', () => {
    const baseDir = path.resolve('C:\\flashpad', 'data');
    expect(resolvePathWithinBaseDir(baseDir, 'notes/local_123.md')).toBe(
      path.resolve(baseDir, 'notes/local_123.md')
    );
    expect(resolvePathWithinBaseDir(baseDir, '../escape.json')).toBeNull();
  });

  it('whitelists known JSON data files only', () => {
    expect(isAllowedDataFilename('categories.json')).toBe(true);
    expect(isAllowedDataFilename('sync-queue.json')).toBe(true);
    expect(isAllowedDataFilename('secrets.json')).toBe(false);
  });
});

describe('parseNoteFile', () => {
  it('rejects frontmatter that carries an unsafe note id', () => {
    const content = [
      '---',
      'id: "../../escape"',
      'categoryId: null',
      `status: ${NoteStatus.Inbox}`,
      'version: 1',
      'deviceId: ""',
      'createdAt: "2026-04-12T00:00:00.000Z"',
      'updatedAt: "2026-04-12T00:00:00.000Z"',
      'isLocal: true',
      'serverId: null',
      '---',
      'Payload',
    ].join('\n');

    expect(parseNoteFile(content)).toBeNull();
  });
});

describe('pinnedAt in note frontmatter', () => {
  const baseMetadata = {
    id: 'note-1',
    categoryId: null,
    status: NoteStatus.Inbox,
    version: 2,
    deviceId: 'desk',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    isLocal: false,
    serverId: 'note-1',
  };

  it('round-trips a pinned note', () => {
    const file = serializeNote({ ...baseMetadata, pinnedAt: '2026-10-03T04:05:06.000Z' }, 'Pinned body');
    const parsed = parseNoteFile(file);
    expect(parsed?.metadata.pinnedAt).toBe('2026-10-03T04:05:06.000Z');
    expect(parsed?.content).toBe('Pinned body');
  });

  it('leaves unpinned files unchanged and reads them back as unpinned', () => {
    const file = serializeNote({ ...baseMetadata, pinnedAt: null }, 'Body');
    expect(file).not.toContain('pinnedAt');
    expect(parseNoteFile(file)?.metadata.pinnedAt).toBeNull();
  });
});
