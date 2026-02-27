import { useState, useEffect, useRef } from 'react';
import { ApiClient } from '@shared/api-client';
import { SyncManager } from '../services/syncManager';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const CODE_LANGUAGES = [
  { value: '', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
];

export default function QuickCaptureCode() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    async function init() {
      const token = await window.electron.quickCapture.getAuthToken();
      if (token) {
        const api = new ApiClient(API_URL);
        api.setToken(token);

        // Initialize SyncManager for offline support
        const syncManager = new SyncManager({
          api,
          onSyncStatusChange: () => {},
          onPendingCountChange: () => {},
        });
        syncManagerRef.current = syncManager;

        setIsAuthenticated(true);
      }
    }
    init();
    textareaRef.current?.focus();

    // Listen for online/offline events
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      syncManagerRef.current?.destroy();
    };
  }, []);

  const handleSubmit = async () => {
    if (!code.trim() || !syncManagerRef.current) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Wrap the code in a markdown code block
      const content = `\`\`\`${language}\n${code.trim()}\n\`\`\``;

      // Use SyncManager which handles offline queuing
      await syncManagerRef.current.createNote({
        content,
        deviceId: 'electron-desktop',
      });
      await window.electron.quickCapture.notifyNoteCreated();
      setCode('');
      setLanguage('');
      await window.electron.quickCaptureCode.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save code snippet');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electron.quickCaptureCode.close();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    // Allow Tab to insert spaces in the code area
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + '  ' + code.substring(end);
        setCode(newCode);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        });
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="quick-capture-container">
        <div className="quick-capture-window quick-capture-code-window">
          <p className="quick-capture-auth-message">
            Please log in to the main app first
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-capture-container">
      <div className="quick-capture-window quick-capture-code-window">
        <div className="quick-capture-code-header">
          <span className="quick-capture-code-title">&lt;/&gt; Code Snippet</span>
          <select
            className="quick-capture-code-lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        {isOffline && (
          <div className="quick-capture-offline-badge">
            Offline - snippet will sync when connected
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="quick-capture-input quick-capture-code-input"
          placeholder="Paste or type your code... (Ctrl+Enter to save, Esc to close)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          autoFocus
          spellCheck={false}
        />
        {error && <p className="quick-capture-error">{error}</p>}
        <div className="quick-capture-actions">
          <button
            className="quick-capture-btn quick-capture-btn-cancel"
            onClick={() => window.electron.quickCaptureCode.close()}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="quick-capture-btn quick-capture-btn-save"
            onClick={handleSubmit}
            disabled={isSubmitting || !code.trim()}
          >
            {isSubmitting ? 'Saving...' : isOffline ? 'Save Offline' : 'Save Snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}
