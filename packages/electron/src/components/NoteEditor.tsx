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

  useEffect(() => {
    setContent(note?.content || '');
    setSelectedCategoryId(note?.categoryId ?? initialCategoryId);
  }, [note?.id, note?.content, note?.categoryId, initialCategoryId]);

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
          onSave(newContent, selectedCategoryId);
        }
      }, 1000);
    },
    [onSave, selectedCategoryId]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    if (!isNew) {
      debouncedSave(newContent);
    }
  };

  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (content.trim()) {
      onSave(content, selectedCategoryId);
    }
  };

  const handleCategoryChange = (categoryId: string | undefined) => {
    const previousCategoryId = selectedCategoryId;
    setSelectedCategoryId(categoryId);
    setShowCategoryDropdown(false);
    if (!isNew && content.trim()) {
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

      {isNew && (
        <div className="note-editor-new-actions">
          <button
            className="note-editor-save-btn"
            onClick={handleManualSave}
            disabled={!content.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      )}
    </div>
  );
}
