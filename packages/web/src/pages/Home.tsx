import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { Note, Category, NoteStatus, CreateCategoryDto, SignalRClient, SignalRManager, ConnectionState } from '@shared/index';
import Sidebar from '../components/Sidebar';
import NotesList from '../components/NotesList';
import NoteEditor from '../components/NoteEditor';
import CategoryManager from '../components/CategoryManager';
import ConnectionStatus from '../components/ConnectionStatus';

type ViewType = 'inbox' | 'archive' | 'trash' | string;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Home() {
  const { api } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedView, setSelectedView] = useState<ViewType>('inbox');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('flashpad-sidebar-width');
    return saved ? parseInt(saved, 10) : 220;
  });
  const [notesListWidth, setNotesListWidth] = useState(() => {
    const saved = localStorage.getItem('flashpad-noteslist-width');
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizing, setIsResizing] = useState<'sidebar' | 'noteslist' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(() => {
    return localStorage.getItem('flashpad-focus-mode') === 'true';
  });
  const [newNoteInitialCategoryId, setNewNoteInitialCategoryId] = useState<string | undefined>();
  const signalRRef = useRef<SignalRClient | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedViewRef = useRef(selectedView);

  // Keep ref in sync with state for use in SignalR callbacks
  useEffect(() => {
    selectedViewRef.current = selectedView;
  }, [selectedView]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isResizing === 'sidebar') {
        const newWidth = Math.max(150, Math.min(400, e.clientX));
        setSidebarWidth(newWidth);
        localStorage.setItem('flashpad-sidebar-width', String(newWidth));
      } else if (isResizing === 'noteslist') {
        const newWidth = Math.max(200, Math.min(500, e.clientX - sidebarWidth - 4));
        setNotesListWidth(newWidth);
        localStorage.setItem('flashpad-noteslist-width', String(newWidth));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  // Focus mode toggle
  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => {
      const next = !prev;
      localStorage.setItem('flashpad-focus-mode', String(next));
      return next;
    });
  }, []);

  // Keyboard shortcut: Ctrl+Shift+F to toggle focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleFocusMode]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  const handleCategoryChanged = useCallback((categoryName: string) => {
    showToast(`Moved to ${categoryName}`);
  }, [showToast]);

  const fetchNotes = useCallback(async () => {
    try {
      let status: NoteStatus | undefined;
      let categoryId: string | undefined;

      if (selectedView === 'inbox') {
        status = NoteStatus.Inbox;
      } else if (selectedView === 'archive') {
        status = NoteStatus.Archived;
      } else if (selectedView === 'trash') {
        status = NoteStatus.Trash;
      } else {
        categoryId = selectedView;
        status = NoteStatus.Inbox;
      }

      const response = await api.getNotes({ status, categoryId });
      setNotes(response.notes);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api, selectedView]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [api]);

  const fetchInboxCount = useCallback(async () => {
    try {
      const response = await api.getNotes({ status: NoteStatus.Inbox, pageSize: 1 });
      setInboxCount(response.totalCount);
    } catch (error) {
      console.error('Failed to fetch inbox count:', error);
    }
  }, [api]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    fetchCategories();
    fetchInboxCount();
  }, [fetchCategories, fetchInboxCount]);

  // SignalR real-time sync - uses singleton to survive React re-renders
  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    // Helper to check if note should show in current view (uses ref for current selectedView)
    const shouldShowInView = (note: Note): boolean => {
      const view = selectedViewRef.current;
      if (view === 'inbox') {
        return note.status === NoteStatus.Inbox && !note.categoryId;
      }
      if (view === 'archive') {
        return note.status === NoteStatus.Archived;
      }
      if (view === 'trash') {
        return note.status === NoteStatus.Trash;
      }
      // Category view
      return note.status === NoteStatus.Inbox && note.categoryId === view;
    };

    // Generate a stable device ID (persisted in localStorage)
    let deviceId = localStorage.getItem('flashpad-device-id');
    if (!deviceId) {
      deviceId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('flashpad-device-id', deviceId);
    }

    // Get or create singleton client - callbacks are updated on each call
    const client = SignalRManager.getInstance({
      baseUrl: API_URL,
      getToken: () => api.getToken(),
      deviceId,
      deviceName: 'Web Browser',
      onConnectionStateChange: setConnectionState,
      onNoteCreated: (note) => {
        // Only add if it matches current view
        if (shouldShowInView(note)) {
          setNotes((prev) => {
            if (prev.some((n) => n.id === note.id)) return prev;
            return [note, ...prev];
          });
        }
        fetchInboxCount();
        fetchCategories();
      },
      onNoteUpdated: (note) => {
        // Move updated note to top if it belongs in current view, remove if not
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.id !== note.id);
          if (shouldShowInView(note)) {
            return [note, ...filtered];
          }
          return filtered;
        });
        setSelectedNote((prev) => (prev?.id === note.id ? note : prev));
        fetchCategories();
      },
      onNoteDeleted: (noteId) => {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setSelectedNote((prev) => (prev?.id === noteId ? null : prev));
        fetchInboxCount();
      },
      onNoteStatusChanged: (note) => {
        // Remove from current view if status changed
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        setSelectedNote((prev) => (prev?.id === note.id ? null : prev));
        fetchInboxCount();
        fetchCategories();
      },
      onCategoryCreated: (category) => {
        setCategories((prev) => [...prev, category]);
      },
      onCategoryUpdated: (category) => {
        setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)));
      },
      onCategoryDeleted: (categoryId) => {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        setSelectedView((currentView) => currentView === categoryId ? 'inbox' : currentView);
      },
    });

    signalRRef.current = client;
    client.start().catch(console.error);

    // Don't stop on cleanup - singleton persists across re-renders
    // Connection is only stopped via SignalRManager.clear() on logout
  }, [api, fetchCategories, fetchInboxCount]);

  // Helper to check if a note should show in current view
  const shouldShowNoteInCurrentView = (note: Note): boolean => {
    if (selectedView === 'inbox') {
      return note.status === NoteStatus.Inbox && !note.categoryId;
    }
    if (selectedView === 'archive') {
      return note.status === NoteStatus.Archived;
    }
    if (selectedView === 'trash') {
      return note.status === NoteStatus.Trash;
    }
    // Category view
    return note.status === NoteStatus.Inbox && note.categoryId === selectedView;
  };

  const getViewTitle = () => {
    if (selectedView === 'inbox') return 'Inbox';
    if (selectedView === 'archive') return 'Archive';
    if (selectedView === 'trash') return 'Trash';
    const category = categories.find((c) => c.id === selectedView);
    return category?.name || 'Notes';
  };

  const handleViewChange = (view: ViewType) => {
    setSelectedView(view);
    setSelectedNote(null);
    setIsNewNote(false);
    setIsLoading(true);
  };

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
    setIsNewNote(false);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setIsNewNote(true);
    setNewNoteInitialCategoryId(undefined);
  };

  const handleNewNoteInCategory = (categoryId: string) => {
    setSelectedNote(null);
    setIsNewNote(true);
    setNewNoteInitialCategoryId(categoryId);
    // Switch to the category view
    setSelectedView(categoryId);
  };

  const handleSave = async (content: string, categoryId?: string) => {
    setIsSaving(true);
    try {
      if (isNewNote) {
        const newNote = await api.createNote({
          content,
          categoryId,
          deviceId: 'web-browser',
        });
        // Use deduplication to avoid race condition with SignalR broadcast
        setNotes((prev) => {
          if (prev.some((n) => n.id === newNote.id)) return prev;
          return [newNote, ...prev];
        });
        setSelectedNote(newNote);
        setIsNewNote(false);
        fetchInboxCount();
        fetchCategories();
      } else if (selectedNote) {
        const updatedNote = await api.updateNote(selectedNote.id, {
          content,
          categoryId,
          deviceId: 'web-browser',
        });
        // Move to top if still in current view, remove if not (e.g., assigned category while in inbox)
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.id !== updatedNote.id);
          if (shouldShowNoteInCurrentView(updatedNote)) {
            return [updatedNote, ...filtered];
          }
          return filtered;
        });
        // Clear selection if note moved out of current view
        if (!shouldShowNoteInCurrentView(updatedNote)) {
          setSelectedNote(null);
        } else {
          setSelectedNote(updatedNote);
        }
        fetchInboxCount();
        fetchCategories();
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedNote) return;
    try {
      await api.archiveNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
    } catch (error) {
      console.error('Failed to archive note:', error);
    }
  };

  const handleRestore = async () => {
    if (!selectedNote) return;
    try {
      await api.restoreNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
    } catch (error) {
      console.error('Failed to restore note:', error);
    }
  };

  const handleTrash = async () => {
    if (!selectedNote) return;
    try {
      await api.trashNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
    } catch (error) {
      console.error('Failed to trash note:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    if (!confirm('Are you sure you want to permanently delete this note?')) return;
    try {
      await api.deleteNotePermanently(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleCreateCategory = async (data: CreateCategoryDto) => {
    await api.createCategory(data);
    fetchCategories();
  };

  const handleUpdateCategory = async (id: string, data: CreateCategoryDto) => {
    await api.updateCategory(id, { ...data, sortOrder: undefined });
    fetchCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    await api.deleteCategory(id);
    if (selectedView === id) {
      setSelectedView('inbox');
    }
    fetchCategories();
    fetchNotes();
  };

  return (
    <div className={`app-layout${isFocusMode ? ' focus-mode' : ''}`}>
      {!isFocusMode && (
        <>
          <Sidebar
            categories={categories}
            selectedView={selectedView}
            onViewChange={handleViewChange}
            onManageCategories={() => setShowCategoryManager(true)}
            onNewNoteInCategory={handleNewNoteInCategory}
            inboxCount={inboxCount}
            archiveCount={0}
            trashCount={0}
            style={{ width: sidebarWidth }}
          />
          <div
            className="resize-handle"
            onMouseDown={() => setIsResizing('sidebar')}
          />
          <NotesList
            notes={searchQuery.trim() ? notes.filter(n => n.content.toLowerCase().includes(searchQuery.toLowerCase())) : notes}
            selectedNoteId={selectedNote?.id || null}
            onNoteSelect={handleNoteSelect}
            onNewNote={handleNewNote}
            isLoading={isLoading}
            viewTitle={getViewTitle()}
            style={{ width: notesListWidth }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showCategory={selectedView === 'inbox' || selectedView === 'archive' || selectedView === 'trash'}
          />
          <div
            className="resize-handle"
            onMouseDown={() => setIsResizing('noteslist')}
          />
        </>
      )}
      <NoteEditor
        note={selectedNote}
        categories={categories}
        onSave={handleSave}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onTrash={handleTrash}
        onDelete={handleDelete}
        isNew={isNewNote}
        isSaving={isSaving}
        onCategoryChanged={handleCategoryChanged}
        initialCategoryId={newNoteInitialCategoryId}
        isFocusMode={isFocusMode}
        onToggleFocusMode={toggleFocusMode}
      />
      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onClose={() => setShowCategoryManager(false)}
        />
      )}
      <ConnectionStatus state={connectionState} />
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">{toastMessage}</div>
        </div>
      )}
    </div>
  );
}

export default Home;
