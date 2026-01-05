import { Note } from '@shared/types';

interface NotesListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onNoteSelect: (note: Note) => void;
  onNewNote: () => void;
  isLoading: boolean;
  viewTitle: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showCategory?: boolean;
  style?: React.CSSProperties;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function getPreview(content: string): string {
  const lines = content.split('\n').filter((line) => line.trim());
  const preview = lines.slice(0, 2).join(' ');
  return preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
}

function getTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine || 'Untitled';
}

export default function NotesList({
  notes,
  selectedNoteId,
  onNoteSelect,
  onNewNote,
  isLoading,
  viewTitle,
  searchQuery,
  onSearchChange,
  showCategory = true,
  style,
}: NotesListProps) {
  return (
    <div className="notes-list" style={style}>
      <div className="notes-list-header">
        <h2 className="notes-list-title">{viewTitle}</h2>
        <button className="notes-list-new-btn" onClick={onNewNote} title="New Note">
          +
        </button>
      </div>
      <div className="notes-list-search">
        <input
          type="text"
          className="notes-list-search-input"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="notes-list-search-clear"
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="notes-list-loading">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="notes-list-empty">
          {searchQuery ? (
            <p>No notes match "{searchQuery}"</p>
          ) : (
            <>
              <p>No notes yet</p>
              <button className="notes-list-empty-btn" onClick={onNewNote}>
                Create your first note
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="notes-list-items">
          {notes.map((note) => (
            <button
              key={note.id}
              className={`notes-list-item ${selectedNoteId === note.id ? 'active' : ''}`}
              onClick={() => onNoteSelect(note)}
            >
              <div className="notes-list-item-header">
                <span className="notes-list-item-title">{getTitle(note.content)}</span>
                <span className="notes-list-item-date">{formatDate(note.updatedAt)}</span>
              </div>
              <div className="notes-list-item-preview">{getPreview(note.content)}</div>
              {showCategory && note.categoryName && (
                <div className="notes-list-item-category">
                  <span
                    className="notes-list-item-category-dot"
                    style={{ backgroundColor: note.categoryColor || '#6366f1' }}
                  />
                  <span>{note.categoryName}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
