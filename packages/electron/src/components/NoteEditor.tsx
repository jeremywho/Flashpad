import { useState, useEffect, useRef, useCallback } from 'react';
import { Note, Category, NoteStatus } from '@shared/types';

const CODE_LANGUAGES = [
  '', 'javascript', 'typescript', 'python', 'csharp', 'java', 'go', 'rust',
  'html', 'css', 'sql', 'bash', 'json', 'yaml', 'xml', 'markdown',
];

/**
 * Hook that debounces the visibility of the saving indicator.
 * - Only shows "Saving..." if the save takes longer than `showDelay` ms (default 500ms).
 * - Once visible, stays visible for at least `minVisible` ms (default 800ms) to avoid flicker.
 */
function useDebouncedSavingIndicator(
  isSaving: boolean,
  showDelay = 500,
  minVisible = 800
): boolean {
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSaving) {
      // Clear any pending hide timer since we're saving again
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Start a delay before showing the indicator
      if (!visible && !showTimerRef.current) {
        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null;
          visibleSinceRef.current = Date.now();
          setVisible(true);
        }, showDelay);
      }
    } else {
      // Save finished — clear the show timer if it hasn't fired yet
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      // If indicator is visible, ensure it stays for minVisible ms
      if (visible && visibleSinceRef.current !== null) {
        const elapsed = Date.now() - visibleSinceRef.current;
        const remaining = minVisible - elapsed;
        if (remaining > 0) {
          hideTimerRef.current = setTimeout(() => {
            hideTimerRef.current = null;
            visibleSinceRef.current = null;
            setVisible(false);
          }, remaining);
        } else {
          visibleSinceRef.current = null;
          setVisible(false);
        }
      }
    }

    return () => {
      // Cleanup only the show timer on effect re-run; hide timer is managed separately
    };
  }, [isSaving, showDelay, minVisible, visible]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return visible;
}

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
  const showSavingIndicator = useDebouncedSavingIndicator(isSaving);
  const [content, setContent] = useState(note?.content || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    note?.categoryId ?? initialCategoryId
  );
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showCodeLangDropdown, setShowCodeLangDropdown] = useState(false);
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

  const insertCodeBlock = useCallback((language: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const before = content.substring(0, start);
    const after = content.substring(end);

    // Add newlines before if not at start of line
    const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
    const prefix = needsNewlineBefore ? '\n' : '';

    const codeBlock = `${prefix}\`\`\`${language}\n${selectedText || ''}\n\`\`\`\n`;
    const newContent = before + codeBlock + after;

    setContent(newContent);
    if (newContent.trim()) {
      debouncedSave(newContent);
    }

    // Position cursor inside the code block
    const cursorPos = before.length + prefix.length + 3 + language.length + 1 + (selectedText?.length || 0);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [content, debouncedSave]);

  const handleCodeBlockInsert = (language: string) => {
    setShowCodeLangDropdown(false);
    insertCodeBlock(language);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleManualSave();
    }
    // Ctrl+Shift+K to insert code block
    if (e.key === 'k' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      insertCodeBlock('');
    }
    // Tab key inside code block: insert 2 spaces instead of changing focus
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const textarea = textareaRef.current;
      if (textarea) {
        const pos = textarea.selectionStart;
        const val = content;
        // Check if cursor is inside a code block
        const beforeCursor = val.substring(0, pos);
        const openFences = (beforeCursor.match(/```/g) || []).length;
        if (openFences % 2 === 1) {
          // Inside a code block - insert spaces instead of tab
          e.preventDefault();
          const before = val.substring(0, pos);
          const after = val.substring(textarea.selectionEnd);
          const newContent = before + '  ' + after;
          setContent(newContent);
          if (newContent.trim()) {
            debouncedSave(newContent);
          }
          requestAnimationFrame(() => {
            textarea.setSelectionRange(pos + 2, pos + 2);
          });
        }
      }
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
          <div className="note-editor-code-block-selector">
            <button
              className="note-editor-action-btn"
              onClick={() => setShowCodeLangDropdown(!showCodeLangDropdown)}
              title="Insert Code Block (Ctrl+Shift+K)"
            >
              &lt;/&gt;
            </button>
            {showCodeLangDropdown && (
              <div className="note-editor-code-lang-dropdown">
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang || '_plain'}
                    className="note-editor-code-lang-option"
                    onClick={() => handleCodeBlockInsert(lang)}
                  >
                    {lang || 'Plain text'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showSavingIndicator && <span className="note-editor-saving">Saving...</span>}
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
