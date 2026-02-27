import { useState, useEffect, useRef, useCallback } from 'react';
import { Note, Category, NoteStatus } from '@shared/types';

const CODE_LANGUAGES = [
  '', 'javascript', 'typescript', 'python', 'csharp', 'java', 'go', 'rust',
  'html', 'css', 'sql', 'bash', 'json', 'yaml', 'xml', 'markdown',
];

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
  const [showCodeLangDropdown, setShowCodeLangDropdown] = useState(false);
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
