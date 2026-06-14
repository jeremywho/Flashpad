import { shouldResetContentOnNoteIdChange, decideNoteSaveMode } from '../noteEditorLogic';

describe('shouldResetContentOnNoteIdChange', () => {
  it('loads a different note when the user is not editing', () => {
    expect(
      shouldResetContentOnNoteIdChange('other note body', 'my last save', false)
    ).toBe(true);
  });

  it('loads a different note even while focused when the content differs', () => {
    expect(
      shouldResetContentOnNoteIdChange('other note body', 'my last save', true)
    ).toBe(true);
  });

  it('loads a note on first selection from the empty editor', () => {
    expect(shouldResetContentOnNoteIdChange('note body', '', false)).toBe(true);
  });

  // The bug: a brand-new note gets its real server id mid-typing. The incoming
  // content equals what we just saved, but the editor is AHEAD of it (the user
  // kept typing during the create round-trip). Resetting here destroys that text.
  it('keeps in-progress text when our own new note is promoted while the user is typing', () => {
    expect(shouldResetContentOnNoteIdChange('Hello', 'Hello', true)).toBe(false);
  });

  it('resets when our own save round-trips but the user is no longer editing', () => {
    expect(shouldResetContentOnNoteIdChange('Hello', 'Hello', false)).toBe(true);
  });
});

describe('decideNoteSaveMode', () => {
  it('updates when a note is already selected', () => {
    expect(decideNoteSaveMode(true, false)).toBe('update');
  });

  it('updates once the note exists, even if a create flag is still set', () => {
    expect(decideNoteSaveMode(true, true)).toBe('update');
  });

  it('creates when there is no selected note and none is being created', () => {
    expect(decideNoteSaveMode(false, false)).toBe('create');
  });

  // Prevents the duplicate-create: a debounced autosave can fire again before
  // the first createNote resolves (the note has no id yet).
  it('skips a duplicate create while one is already in flight', () => {
    expect(decideNoteSaveMode(false, true)).toBe('skip');
  });
});
