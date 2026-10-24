const test = require('node:test');
const assert = require('node:assert/strict');
const { getPinnedNotes, isNotePinned } = require('../dist/pinnedNotes');
const { NoteStatus } = require('../dist/types');

function note(id, overrides = {}) {
  return {
    id,
    content: id,
    status: NoteStatus.Inbox,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

test('isNotePinned treats missing, null and empty pinnedAt as unpinned', () => {
  assert.equal(isNotePinned(note('a')), false);
  assert.equal(isNotePinned(note('b', { pinnedAt: null })), false);
  assert.equal(isNotePinned(note('c', { pinnedAt: '' })), false);
  assert.equal(isNotePinned(note('d', { pinnedAt: '2026-10-02T00:00:00Z' })), true);
});

test('getPinnedNotes keeps pinned notes in the order they were pinned', () => {
  const notes = [
    note('second', { pinnedAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }),
    note('unpinned'),
    note('first', { pinnedAt: '2026-10-02T00:00:00Z' }),
  ];

  assert.deepEqual(getPinnedNotes(notes).map((n) => n.id), ['first', 'second']);
});

test('getPinnedNotes hides trashed notes but keeps archived and categorized ones', () => {
  const notes = [
    note('trashed', { pinnedAt: '2026-10-02T00:00:00Z', status: NoteStatus.Trash }),
    note('archived', { pinnedAt: '2026-10-03T00:00:00Z', status: NoteStatus.Archived }),
    note('categorized', { pinnedAt: '2026-10-04T00:00:00Z', categoryId: 'cat-1' }),
  ];

  assert.deepEqual(getPinnedNotes(notes).map((n) => n.id), ['archived', 'categorized']);
});

test('getPinnedNotes does not reorder the caller array', () => {
  const notes = [
    note('b', { pinnedAt: '2026-10-05T00:00:00Z' }),
    note('a', { pinnedAt: '2026-10-02T00:00:00Z' }),
  ];
  getPinnedNotes(notes);
  assert.deepEqual(notes.map((n) => n.id), ['b', 'a']);
});

test('getNoteHomeView opens a note in the view that lists it', () => {
  const { getNoteHomeView } = require('../dist/pinnedNotes');
  assert.equal(getNoteHomeView(note('a')), 'inbox');
  assert.equal(getNoteHomeView(note('b', { categoryId: 'cat-1' })), 'cat-1');
  assert.equal(getNoteHomeView(note('c', { categoryId: 'cat-1', status: NoteStatus.Archived })), 'archive');
  assert.equal(getNoteHomeView(note('d', { status: NoteStatus.Trash })), 'trash');
});
