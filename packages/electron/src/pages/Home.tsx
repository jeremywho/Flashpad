import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { Note, Category, NoteStatus, CreateCategoryDto, SignalRClient, SignalRManager, ConnectionState, DevicePresence, h4 } from '@shared/index';
import Sidebar from '../components/Sidebar';
import NotesList from '../components/NotesList';
import NoteEditor from '../components/NoteEditor';
import CategoryManager from '../components/CategoryManager';
import { useToast } from '../components/Toast';
import { SyncManager, SyncStatus } from '../services/syncManager';
import { startFileWatcher, stopFileWatcher } from '../services/file-watcher';
import { saveLocalNote, deleteLocalNote, saveLocalCategory, deleteLocalCategory } from '../services/database';

type ViewType = 'inbox' | 'archive' | 'trash' | string;

const API_URL = window.electron.app.apiBaseUrl || import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Home() {
  const { api, logout } = useAuth();
  const toast = useToast();
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(() => {
    return localStorage.getItem('flashpad-focus-mode') === 'true';
  });
  const [_connectedDevices, setConnectedDevices] = useState<DevicePresence[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('flashpad-sidebar-width');
    return saved ? parseInt(saved, 10) : 220;
  });
  const [notesListWidth, setNotesListWidth] = useState(() => {
    const saved = localStorage.getItem('flashpad-noteslist-width');
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizing, setIsResizing] = useState<'sidebar' | 'noteslist' | null>(null);
  const [newNoteInitialCategoryId, setNewNoteInitialCategoryId] = useState<string | undefined>();
  const [pendingNoteIds, setPendingNoteIds] = useState<Set<string>>(new Set());

  const signalRRef = useRef<SignalRClient | null>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);
  const selectedViewRef = useRef(selectedView);
  const selectedNoteRef = useRef(selectedNote);

  // Keep refs in sync with state for use in callbacks
  useEffect(() => {
    selectedViewRef.current = selectedView;
  }, [selectedView]);
  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
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

  const handleCategoryChanged = useCallback((categoryName: string) => {
    toast.success(`Moved to ${categoryName}`);
  }, [toast]);

  const fetchPendingNoteIds = useCallback(async () => {
    if (!syncManagerRef.current) return;
    try {
      const ids = await syncManagerRef.current.getPendingNoteIds();
      setPendingNoteIds(ids);
    } catch (error) {
      console.error('Failed to fetch pending note IDs:', error);
    }
  }, []);

  useEffect(() => {
    fetchPendingNoteIds();
  }, [pendingCount, fetchPendingNoteIds]);

  // Initialize H4 client-side logger and SyncManager
  useEffect(() => {
    // Generate a stable device ID (persisted in localStorage)
    let deviceId = localStorage.getItem('flashpad-device-id');
    if (!deviceId) {
      deviceId = `electron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('flashpad-device-id', deviceId);
    }

    h4.init({
      baseUrl: API_URL,
      getToken: () => api.getToken(),
      source: 'electron',
      deviceId,
      flushIntervalMs: 5000,
      bufferSize: 20,
    });

    window.electron.app.getVersion().then((appVersion) => {
      h4.setGlobalMetadata({
        appVersion,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
      });
      h4.info('App initializing', {
        deviceId,
        apiUrl: API_URL,
        online: navigator.onLine,
      });
    });

    const syncManager = new SyncManager({
      api,
      deviceId,
      onSyncStatusChange: setSyncStatus,
      onPendingCountChange: setPendingCount,
      onDataRefresh: () => {
        h4.debug('Data refresh triggered by sync queue completion');
        fetchNotes();
        fetchCategories();
        fetchInboxCount();
      },
      onAuthError: logout,
      onConflict: (noteId, serverVersion) => {
        h4.warning('Conflict resolved — refreshed to server version', { noteId, serverVersion });
        toast.warning('Note was modified on another device — refreshed to latest version');
        fetchNotes();
      },
      onSyncItemFailed: (item) => {
        const op = item.operation.toLowerCase();
        toast.error(`Failed to sync ${item.entityType} ${op}. Retry needed.`);
        h4.error('Sync item requires manual retry', {
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          lastError: item.lastError,
        });
      },
    });

    syncManagerRef.current = syncManager;

    // Perform initial sync
    syncManager.initialSync().then(() => {
      fetchNotes();
      fetchCategories();
      fetchInboxCount();
    });

    return () => {
      syncManager.destroy();
      syncManagerRef.current = null;
      h4.destroy();
    };
  }, [api, logout]);

  const fetchNotes = useCallback(async () => {
    if (!syncManagerRef.current) return;

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

      // Get notes from local database via SyncManager
      const localNotes = await syncManagerRef.current.getNotes({ status, categoryId });

      // Filter by search query if present
      let filteredNotes = localNotes;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filteredNotes = localNotes.filter((n) =>
          n.content.toLowerCase().includes(query)
        );
      }

      // Filter inbox notes to exclude those with categories
      if (selectedView === 'inbox') {
        setNotes(filteredNotes.filter((n) => !n.categoryId));
      } else {
        setNotes(filteredNotes);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedView, searchQuery]);

  // Always reads from local DB — no API call. Categories are synced during
  // initial sync and kept in sync via SignalR events and CRUD operations.
  const fetchCategories = useCallback(async () => {
    if (!syncManagerRef.current) return;
    try {
      const cats = await syncManagerRef.current.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  const fetchInboxCount = useCallback(async () => {
    if (!syncManagerRef.current) return;

    try {
      const count = await syncManagerRef.current.getInboxCount();
      setInboxCount(count);
    } catch (error) {
      console.error('Failed to fetch inbox count:', error);
    }
  }, []);

  useEffect(() => {
    if (syncManagerRef.current) {
      fetchNotes();
    }
  }, [fetchNotes]);

  useEffect(() => {
    if (syncManagerRef.current) {
      fetchCategories();
      fetchInboxCount();
    }
  }, [fetchCategories, fetchInboxCount]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchNotes();
      fetchCategories();
      fetchInboxCount();
      syncManagerRef.current?.processSyncQueue();
    };

    window.electron.onRefreshNotes(handleRefresh);
    return () => {
      window.electron.removeRefreshNotesListener();
    };
  }, [fetchNotes, fetchCategories, fetchInboxCount]);

  // Initialize file watcher for external file changes
  useEffect(() => {
    const handleFileChange = (event: 'noteUpdated' | 'noteDeleted', noteId: string) => {
      // Refresh notes when files change externally
      fetchNotes();
      fetchInboxCount();
      fetchCategories();

      // Sync any newly queued notes to the server
      syncManagerRef.current?.processSyncQueue();

      // If the currently selected note was deleted, clear selection
      // (uses ref to avoid re-creating the file watcher on every note selection)
      if (event === 'noteDeleted' && selectedNoteRef.current?.id === noteId) {
        setSelectedNote(null);
      }
    };

    startFileWatcher(handleFileChange).catch((err) => {
      console.error('Failed to start file watcher:', err);
    });

    // Periodically process the sync queue as a safety net for any items
    // that were missed (e.g. added while processSyncQueue was already running)
    const syncInterval = setInterval(() => {
      syncManagerRef.current?.processSyncQueue();
    }, 300_000);

    return () => {
      clearInterval(syncInterval);
      stopFileWatcher().catch((err) => {
        console.error('Failed to stop file watcher:', err);
      });
    };
  }, [fetchNotes, fetchInboxCount, fetchCategories]);

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
      deviceId = `electron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('flashpad-device-id', deviceId);
    }
    const deviceName = 'Desktop App';

    // Get or create singleton client - callbacks are updated on each call
    const client = SignalRManager.getInstance({
      baseUrl: API_URL,
      getToken: () => api.getToken(),
      deviceId,
      deviceName,
      onConnectionStateChange: setConnectionState,
      onPresenceUpdated: (devices) => {
        setConnectedDevices(devices);
      },
      onDeviceConnected: (device) => {
        console.log('Device connected:', device.deviceName);
      },
      onDeviceDisconnected: (device) => {
        console.log('Device disconnected:', device.deviceName);
      },
      onAuthError: logout,
      onNoteCreated: async (note) => {
        await saveLocalNote(note, false);
        if (shouldShowInView(note)) {
          setNotes((prev) => {
            if (prev.some((n) => n.id === note.id)) return prev;
            return [note, ...prev];
          });
        }
        fetchInboxCount();
        fetchCategories();
      },
      onNoteUpdated: async (note) => {
        await saveLocalNote(note, false);
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
      onNoteDeleted: async (noteId) => {
        await deleteLocalNote(noteId);
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setSelectedNote((prev) => (prev?.id === noteId ? null : prev));
        fetchInboxCount();
      },
      onNoteStatusChanged: async (note) => {
        await saveLocalNote(note, false);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        setSelectedNote((prev) => (prev?.id === note.id ? null : prev));
        fetchInboxCount();
        fetchCategories();
      },
      onCategoryCreated: async (category) => {
        await saveLocalCategory(category, false);
        setCategories((prev) => [...prev, category]);
      },
      onCategoryUpdated: async (category) => {
        await saveLocalCategory(category, false);
        setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)));
      },
      onCategoryDeleted: async (categoryId) => {
        await deleteLocalCategory(categoryId);
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        setSelectedView((currentView) => currentView === categoryId ? 'inbox' : currentView);
      },
      onReconnected: () => {
        h4.info('SignalR reconnected — triggering catch-up sync');
        syncManagerRef.current?.initialSync().then(() => {
          fetchNotes();
          fetchCategories();
          fetchInboxCount();
        });
      },
    });

    signalRRef.current = client;
    client.start().catch(console.error);

    // Don't stop on cleanup - singleton persists across re-renders
    // Connection is only stopped via SignalRManager.removeInstance() on logout
  }, [api, logout, fetchCategories, fetchInboxCount]);

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
    if (view === selectedView) return;
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
    if (!syncManagerRef.current) return;

    setIsSaving(true);
    try {
      if (isNewNote) {
        const newNote = await syncManagerRef.current.createNote({
          content,
          categoryId,
          deviceId: localStorage.getItem('flashpad-device-id') || 'electron-desktop',
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
        const updatedNote = await syncManagerRef.current.updateNote(selectedNote.id, {
          content,
          categoryId,
          deviceId: localStorage.getItem('flashpad-device-id') || 'electron-desktop',
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
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedNote || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.archiveNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
      toast.success('Note archived');
    } catch (error) {
      console.error('Failed to archive note:', error);
      toast.error('Failed to archive note');
    }
  };

  const handleRestore = async () => {
    if (!selectedNote || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.restoreNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
      toast.success('Note restored');
    } catch (error) {
      console.error('Failed to restore note:', error);
      toast.error('Failed to restore note');
    }
  };

  const handleTrash = async () => {
    if (!selectedNote || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.trashNote(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      fetchCategories();
      toast.success('Note moved to trash');
    } catch (error) {
      console.error('Failed to trash note:', error);
      toast.error('Failed to move note to trash');
    }
  };

  const handleDelete = async () => {
    if (!selectedNote || !syncManagerRef.current) return;
    if (!confirm('Are you sure you want to permanently delete this note?')) return;
    try {
      await syncManagerRef.current.deleteNotePermanently(selectedNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
      setSelectedNote(null);
      toast.success('Note deleted permanently');
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
    }
  };

  const handleCreateCategory = async (data: CreateCategoryDto) => {
    if (!syncManagerRef.current) return;
    try {
      await syncManagerRef.current.createCategory(data);
      fetchCategories();
      toast.success('Category created');
    } catch (error) {
      console.error('Failed to create category:', error);
      toast.error('Failed to create category');
    }
  };

  const handleUpdateCategory = async (id: string, data: CreateCategoryDto) => {
    if (!syncManagerRef.current) return;
    try {
      await syncManagerRef.current.updateCategory(id, { ...data, sortOrder: undefined });
      fetchCategories();
      toast.success('Category updated');
    } catch (error) {
      console.error('Failed to update category:', error);
      toast.error('Failed to update category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!syncManagerRef.current) return;
    try {
      await syncManagerRef.current.deleteCategory(id);
      if (selectedView === id) {
        setSelectedView('inbox');
      }
      fetchCategories();
      fetchNotes();
      toast.success('Category deleted');
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast.error('Failed to delete category');
    }
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
            syncStatus={syncStatus}
            connectionState={connectionState}
            pendingCount={pendingCount}
          />
          <div
            className="resize-handle"
            onMouseDown={() => setIsResizing('sidebar')}
          />
          <NotesList
            notes={notes}
            selectedNoteId={selectedNote?.id || null}
            onNoteSelect={handleNoteSelect}
            onNewNote={handleNewNote}
            isLoading={isLoading}
            viewTitle={getViewTitle()}
            style={{ width: notesListWidth }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showCategory={selectedView === 'inbox' || selectedView === 'archive' || selectedView === 'trash'}
            pendingNoteIds={pendingNoteIds}
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
        syncStatus={syncStatus}
        connectionState={connectionState}
        pendingCount={pendingCount}
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
    </div>
  );
}

export default Home;
