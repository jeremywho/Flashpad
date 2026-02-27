import { useState, useEffect, useRef, useCallback } from 'react';
import { Note, Category, NoteStatus } from '@shared/types';

interface NoteEditorProps {
  note: Note | null;
  categories: Category[];
  onSave: (content: string, categoryId?: string) => void;
  onArchive: () => void;
  onRestore: () => void;
  onTrash: () => void;
  onDelete: () => void;
  isNew: boolean;
  isSaving: boolean;
  onCategoryChanged?: (categoryName: string) => void;
  initialCategoryId?: string;
}

export default function NoteEditor({
  note,
  categories,
  onSave,
  onArchive,
  onRestore,
  onTrash,
  onDelete,
  isNew,
  isSaving,
  onCategoryChanged,
  initialCategoryId,
}: NoteEditorProps) {
  const [content, setContent] = useState(note?.content || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    note?.categoryId ?? initialCategoryId
  );
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track the last content we sent to onSave to distinguish our own saves
  // from external updates (e.g., edits from another device via SignalR).
  const lastSavedContentRef = useRef<string>(note?.content || '');
  // Track the note ID to detect when the user switches to a different note.
  const prevNoteIdRef = useRef<string | undefined>(note?.id);

  // Reset content when switching to a different note (note ID changed).
  useEffect(() => {
    if (note?.id !== prevNoteIdRef.current) {
      setContent(note?.content || '');
      lastSavedContentRef.current = note?.content || '';
      prevNoteIdRef.current = note?.id;
    }
  }, [note?.id, note?.content]);

  // Sync category when the note changes or initialCategoryId changes.
  useEffect(() => {
    setSelectedCategoryId(note?.categoryId ?? initialCategoryId);
  }, [note?.id, note?.categoryId, initialCategoryId]);

  // Handle external content changes (e.g., edits from another device via SignalR)
  // without disrupting cursor position during the user's own auto-saves.
  // Only update if the incoming content differs from what we last saved AND
  // differs from what is currently in the editor (i.e., a true external change).
  useEffect(() => {
    const incomingContent = note?.content || '';
    // Skip if we are on a different note (handled by the ID-change effect above)
    if (note?.id !== prevNoteIdRef.current) return;
    // Skip if incoming content matches what we last saved -- this is just our
    // own save round-tripping back to us and should NOT reset the editor.
    if (incomingContent === lastSavedContentRef.current) return;
    // The content was changed externally. Only apply it if the user is not
    // actively typing (textarea not focused), to avoid cursor jumps.
    if (textareaRef.current && document.activeElement === textareaRef.current) {
      // User is typing -- store the external version but don't disrupt them.
      // Their next save will merge/overwrite anyway.
      return;
    }
    setContent(incomingContent);
    lastSavedContentRef.current = incomingContent;
  }, [note?.content, note?.id]);

  useEffect(() => {
    if (isNew && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isNew]);

  const debouncedSave = useCallback(
    (newContent: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (newContent.trim()) {
          lastSavedContentRef.current = newContent;
          onSave(newContent, selectedCategoryId);
        }
      }, 1000);
    },
    [onSave, selectedCategoryId]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    // Autosave for both new and existing notes (as long as content isn't empty)
    if (newContent.trim()) {
      debouncedSave(newContent);
    }
  };

  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (content.trim()) {
      lastSavedContentRef.current = content;
      onSave(content, selectedCategoryId);
    }
  };

  const handleCategoryChange = (categoryId: string | undefined) => {
    const previousCategoryId = selectedCategoryId;
    setSelectedCategoryId(categoryId);
    setShowCategoryDropdown(false);
    if (!isNew && content.trim()) {
      lastSavedContentRef.current = content;
      onSave(content, categoryId);
      // Notify parent if category actually changed
      if (previousCategoryId !== categoryId && onCategoryChanged) {
        const newCategoryName = categoryId
          ? categories.find(c => c.id === categoryId)?.name || 'category'
          : 'Inbox';
        onCategoryChanged(newCategoryName);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleManualSave();
    }
  };

  if (!note && !isNew) {
    return (
      <div className="note-editor-empty">
        <div className="note-editor-empty-content">
          <span className="note-editor-empty-icon">&#128221;</span>
          <p>Select a note or create a new one</p>
        </div>
      </div>
    );
  }

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="note-editor">
      <div className="note-editor-toolbar">
        <div className="note-editor-toolbar-left">
          <div className="note-editor-category-selector">
            <span className="note-editor-category-label">Move to:</span>
            <button
              className="note-editor-category-btn"
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            >
              {selectedCategory ? (
                <>
                  <span
                    className="note-editor-category-dot"
                    style={{ backgroundColor: selectedCategory.color }}
                  />
                  {selectedCategory.name}
                </>
              ) : (
                'Inbox'
              )}
              <span className="note-editor-category-arrow">&#9662;</span>
            </button>
            {showCategoryDropdown && (
              <div className="note-editor-category-dropdown">
                <button
                  className={`note-editor-category-option ${!selectedCategoryId ? 'selected' : ''}`}
                  onClick={() => handleCategoryChange(undefined)}
                >
                  Inbox
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`note-editor-category-option ${selectedCategoryId === category.id ? 'selected' : ''}`}
                    onClick={() => handleCategoryChange(category.id)}
                  >
                    <span
                      className="note-editor-category-dot"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isSaving && <span className="note-editor-saving">Saving...</span>}
        </div>

        <div className="note-editor-toolbar-right">
          {note?.status === NoteStatus.Inbox && (
            <button
              className="note-editor-action-btn"
              onClick={onArchive}
              title="Archive"
            >
              &#128451;
            </button>
          )}
          {note?.status === NoteStatus.Archived && (
            <button
              className="note-editor-action-btn"
              onClick={onRestore}
              title="Move to Inbox"
            >
              &#128229;
            </button>
          )}
          {note?.status === NoteStatus.Trash ? (
            <>
              <button
                className="note-editor-action-btn"
                onClick={onRestore}
                title="Restore"
              >
                &#8634;
              </button>
              <button
                className="note-editor-action-btn danger"
                onClick={onDelete}
                title="Delete Permanently"
              >
                &#128465;
              </button>
            </>
          ) : (
            <button
              className="note-editor-action-btn"
              onClick={onTrash}
              title="Move to Trash"
            >
              &#128465;
            </button>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="note-editor-content"
        value={content}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="Start typing your note..."
        autoFocus={isNew}
      />
    </div>
  );
}
