/**
 * Pure decision helpers for NoteEditor's content-sync and save behavior.
 * Extracted so the tricky autosave/echo edge cases can be unit-tested without a
 * full React render.
 */

/**
 * Decide whether the editor should replace its content when the bound note's id
 * changes.
 *
 * Normally an id change means the user switched to a different note, so we load
 * that note's content. The exception is our own brand-new note coming back with
 * its real server id: the incoming content is exactly what we just saved, and
 * the user may have kept typing during the create round-trip (so the editor is
 * AHEAD of the saved snapshot). Resetting there silently discards the text typed
 * during the round-trip — the bug this guards against.
 */
export function shouldResetContentOnNoteIdChange(
  incomingContent: string,
  lastSavedContent: string,
  isActivelyEditing: boolean
): boolean {
  if (isActivelyEditing && incomingContent === lastSavedContent) {
    return false;
  }
  return true;
}

/**
 * Decide how an autosave should persist the current note.
 *
 * A debounced autosave for a brand-new note can fire more than once before the
 * first createNote() resolves (the note has no id yet). Without this guard the
 * second fire creates a duplicate note on the server. Once a note exists we
 * always update it, even if a create is still notionally in flight.
 */
export function decideNoteSaveMode(
  hasSelectedNote: boolean,
  isCreatingNote: boolean
): 'create' | 'update' | 'skip' {
  if (hasSelectedNote) return 'update';
  if (isCreatingNote) return 'skip';
  return 'create';
}
