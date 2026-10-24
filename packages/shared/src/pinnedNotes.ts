import { Note, NoteStatus } from './types';

export function isNotePinned(note: Pick<Note, 'pinnedAt'>): boolean {
  return typeof note.pinnedAt === 'string' && note.pinnedAt.length > 0;
}

export function getPinnedNotes(notes: Note[]): Note[] {
  return notes
    .filter((note) => isNotePinned(note) && note.status !== NoteStatus.Trash)
    .sort((a, b) => Date.parse(a.pinnedAt as string) - Date.parse(b.pinnedAt as string));
}

export function getNoteHomeView(note: Pick<Note, 'status' | 'categoryId'>): string {
  if (note.status === NoteStatus.Archived) return 'archive';
  if (note.status === NoteStatus.Trash) return 'trash';
  return note.categoryId || 'inbox';
}
