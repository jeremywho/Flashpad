import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { Note, Category, NoteStatus, CreateCategoryDto, SignalRClient, ConnectionState, DevicePresence } from '@shared/index';
import Sidebar from '../components/Sidebar';
import NotesList from '../components/NotesList';
import NoteEditor from '../components/NoteEditor';
import CategoryManager from '../components/CategoryManager';
import ConnectionStatus from '../components/ConnectionStatus';
import { useToast } from '../components/Toast';
import { SyncManager, SyncStatus } from '../services/syncManager';

type ViewType = 'inbox' | 'archive' | 'trash' | string;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Home() {
  const { api } = useAuth();
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
  const [connectedDevices, setConnectedDevices] = useState<DevicePresence[]>([]);

  const signalRRef = useRef<SignalRClient | null>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);

  // Initialize SyncManager
  useEffect(() => {
    const syncManager = new SyncManager({
      api,
      onSyncStatusChange: setSyncStatus,
      onPendingCountChange: setPendingCount,
      onDataRefresh: () => {
        // Refresh data after sync completes
        fetchNotes();
        fetchCategories();
        fetchInboxCount();
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
    };
  }, [api]);

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
    };

    window.electron.onRefreshNotes(handleRefresh);
    return () => {
      window.electron.removeRefreshNotesListener();
    };
  }, [fetchNotes, fetchCategories, fetchInboxCount]);

  // SignalR real-time sync
  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    // Generate a unique device ID for this instance
    const deviceId = `electron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const deviceName = 'Desktop App';

    const client = new SignalRClient({
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
      onNoteCreated: (note) => {
        // Only add if it matches current view
        if (shouldShowNoteInCurrentView(note)) {
          setNotes((prev) => {
            if (prev.some((n) => n.id === note.id)) return prev;
            return [note, ...prev];
          });
        }
        fetchInboxCount();
        fetchCategories();
      },
      onNoteUpdated: (note) => {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
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
        if (selectedView === categoryId) {
          setSelectedView('inbox');
        }
      },
    });

    signalRRef.current = client;
    client.start().catch(console.error);

    return () => {
      client.stop();
      signalRRef.current = null;
    };
  }, [api, selectedView]);

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
  };

  const handleSave = async (content: string, categoryId?: string) => {
    if (!syncManagerRef.current) return;

    setIsSaving(true);
    try {
      if (isNewNote) {
        const newNote = await syncManagerRef.current.createNote({
          content,
          categoryId,
          deviceId: 'electron-desktop',
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
          deviceId: 'electron-desktop',
        });
        setNotes((prev) =>
          prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))
        );
        setSelectedNote(updatedNote);
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
    <div className="app-layout">
      <Sidebar
        categories={categories}
        selectedView={selectedView}
        onViewChange={handleViewChange}
        onManageCategories={() => setShowCategoryManager(true)}
        inboxCount={inboxCount}
        archiveCount={0}
        trashCount={0}
      />
      <NotesList
        notes={notes}
        selectedNoteId={selectedNote?.id || null}
        onNoteSelect={handleNoteSelect}
        onNewNote={handleNewNote}
        isLoading={isLoading}
        viewTitle={getViewTitle()}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
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
      <ConnectionStatus
        connectionState={connectionState}
        syncStatus={syncStatus}
        pendingCount={pendingCount}
        connectedDevices={connectedDevices}
      />
    </div>
  );
}

export default Home;
