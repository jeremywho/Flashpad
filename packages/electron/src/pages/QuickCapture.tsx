import { useState, useEffect, useRef } from 'react';
import { ApiClient } from '@shared/api-client';

const API_URL = 'http://localhost:5000';

export default function QuickCapture() {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const apiRef = useRef<ApiClient | null>(null);

  useEffect(() => {
    async function init() {
      const token = await window.electron.quickCapture.getAuthToken();
      if (token) {
        apiRef.current = new ApiClient(API_URL);
        apiRef.current.setToken(token);
        setIsAuthenticated(true);
      }
    }
    init();
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!content.trim() || !apiRef.current) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiRef.current.createNote({
        content: content.trim(),
        deviceId: 'electron-desktop',
      });
      await window.electron.quickCapture.notifyNoteCreated();
      setContent('');
      await window.electron.quickCapture.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electron.quickCapture.close();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="quick-capture-container">
        <div className="quick-capture-window">
          <p className="quick-capture-auth-message">
            Please log in to the main app first
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-capture-container">
      <div className="quick-capture-window">
        <textarea
          ref={textareaRef}
          className="quick-capture-input"
          placeholder="Capture a quick note... (Ctrl+Enter to save, Esc to close)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          autoFocus
        />
        {error && <p className="quick-capture-error">{error}</p>}
        <div className="quick-capture-actions">
          <button
            className="quick-capture-btn quick-capture-btn-cancel"
            onClick={() => window.electron.quickCapture.close()}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="quick-capture-btn quick-capture-btn-save"
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
