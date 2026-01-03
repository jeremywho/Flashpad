import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { SyncManager, SyncStatus } from '../services/syncManager';
import type { Note, Category, NoteStatus } from '@flashpad/shared';
import { SignalRClient, ConnectionState } from '@flashpad/shared';

// API URL based on platform - iOS simulator uses localhost, Android emulator needs 10.0.2.2
const API_URL = Platform.OS === 'ios' ? 'http://localhost:5000' : 'http://10.0.2.2:5000';

interface HomeScreenProps {
  navigation: any;
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
  return preview.length > 80 ? preview.substring(0, 80) + '...' : preview;
}

function getTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 40 ? firstLine.substring(0, 40) + '...' : firstLine || 'Untitled';
}

type TabType = 'inbox' | 'archive' | 'trash';

function HomeScreen({ navigation }: HomeScreenProps) {
  const { api, logout } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabType>('inbox');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const syncManagerRef = useRef<SyncManager | null>(null);
  const signalRRef = useRef<SignalRClient | null>(null);

  const getStatusForTab = (tab: TabType): NoteStatus => {
    switch (tab) {
      case 'inbox':
        return 0;
      case 'archive':
        return 1;
      case 'trash':
        return 2;
    }
  };

  // Initialize SyncManager
  useEffect(() => {
    const syncManager = new SyncManager({
      api,
      onSyncStatusChange: setSyncStatus,
      onPendingCountChange: setPendingCount,
      onDataRefresh: () => {
        fetchNotes();
        fetchCategories();
      },
    });

    syncManagerRef.current = syncManager;

    // Perform initial sync
    syncManager.initialSync().then(() => {
      fetchNotes();
      fetchCategories();
    });

    return () => {
      syncManager.destroy();
      syncManagerRef.current = null;
    };
  }, [api]);

  const fetchNotes = useCallback(async () => {
    if (!syncManagerRef.current) return;

    try {
      const localNotes = await syncManagerRef.current.getNotes({
        status: getStatusForTab(selectedTab),
      });
      setNotes(localNotes);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedTab]);

  const fetchCategories = useCallback(async () => {
    if (!syncManagerRef.current) return;

    try {
      const cats = await syncManagerRef.current.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  useEffect(() => {
    if (syncManagerRef.current) {
      setIsLoading(true);
      fetchNotes();
    }
  }, [fetchNotes]);

  useEffect(() => {
    if (syncManagerRef.current) {
      fetchCategories();
    }
  }, [fetchCategories]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (syncManagerRef.current) {
        fetchNotes();
        fetchCategories();
      }
    });
    return unsubscribe;
  }, [navigation, fetchNotes, fetchCategories]);

  // Helper to check if a note should show in current view
  const shouldShowNoteInCurrentView = useCallback((note: Note): boolean => {
    if (selectedTab === 'inbox') {
      return note.status === 0; // NoteStatus.Inbox
    }
    if (selectedTab === 'archive') {
      return note.status === 1; // NoteStatus.Archived
    }
    if (selectedTab === 'trash') {
      return note.status === 2; // NoteStatus.Trash
    }
    return false;
  }, [selectedTab]);

  // SignalR real-time sync
  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    const client = new SignalRClient({
      baseUrl: API_URL,
      getToken: () => api.getToken(),
      onConnectionStateChange: setConnectionState,
      onNoteCreated: (note) => {
        // Only add if it matches current view
        if (shouldShowNoteInCurrentView(note)) {
          setNotes((prev) => {
            if (prev.some((n) => n.id === note.id)) return prev;
            return [note, ...prev];
          });
        }
        fetchCategories();
      },
      onNoteUpdated: (note) => {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
        fetchCategories();
      },
      onNoteDeleted: (noteId) => {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      },
      onNoteStatusChanged: (note) => {
        // Remove from current view if status changed
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
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
      },
    });

    signalRRef.current = client;
    client.start().catch(console.error);

    return () => {
      client.stop();
      signalRRef.current = null;
    };
  }, [api, shouldShowNoteInCurrentView, fetchCategories]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotes();
    syncManagerRef.current?.processSyncQueue();
  };

  const handleNotePress = (note: Note) => {
    navigation.navigate('NoteEditor', { noteId: note.id });
  };

  const handleNewNote = () => {
    navigation.navigate('NoteEditor', { isNew: true });
  };

  const handleLogout = async () => {
    await syncManagerRef.current?.clearAllData();
    await logout();
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity
      style={styles.noteItem}
      onPress={() => handleNotePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.noteHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {getTitle(item.content)}
        </Text>
        <View style={styles.noteMeta}>
          {item.id.startsWith('local_') && (
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeText}>Local</Text>
            </View>
          )}
          <Text style={styles.noteDate}>{formatDate(item.updatedAt)}</Text>
        </View>
      </View>
      <Text style={styles.notePreview} numberOfLines={2}>
        {getPreview(item.content)}
      </Text>
      {item.categoryName && (
        <View style={styles.noteCategory}>
          <View
            style={[
              styles.categoryDot,
              { backgroundColor: item.categoryColor || colors.accent },
            ]}
          />
          <Text style={styles.categoryName}>{item.categoryName}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const getTabTitle = () => {
    switch (selectedTab) {
      case 'inbox':
        return 'Inbox';
      case 'archive':
        return 'Archive';
      case 'trash':
        return 'Trash';
    }
  };

  const renderSyncStatus = () => {
    if (syncStatus === 'syncing') {
      return (
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, styles.syncDotSyncing]} />
          <Text style={styles.syncText}>Syncing...</Text>
        </View>
      );
    }
    if (pendingCount > 0) {
      return (
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, styles.syncDotPending]} />
          <Text style={styles.syncText}>{pendingCount} pending</Text>
        </View>
      );
    }
    if (syncStatus === 'offline') {
      return (
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, styles.syncDotOffline]} />
          <Text style={styles.syncText}>Offline</Text>
        </View>
      );
    }
    if (connectionState === 'connected') {
      return (
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, styles.syncDotConnected]} />
          <Text style={styles.syncText}>Live</Text>
        </View>
      );
    }
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return (
        <View style={styles.syncBadge}>
          <View style={[styles.syncDot, styles.syncDotConnecting]} />
          <Text style={styles.syncText}>Connecting...</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{getTabTitle()}</Text>
          {renderSyncStatus()}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Account')}
          >
            <Text style={styles.headerButtonText}>Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading notes...</Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNote}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {selectedTab === 'trash'
                  ? 'Trash is empty'
                  : selectedTab === 'archive'
                  ? 'No archived notes'
                  : 'No notes yet'}
              </Text>
              {selectedTab === 'inbox' && (
                <TouchableOpacity style={styles.emptyButton} onPress={handleNewNote}>
                  <Text style={styles.emptyButtonText}>Create your first note</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          contentContainerStyle={notes.length === 0 ? styles.emptyList : undefined}
        />
      )}

      {selectedTab === 'inbox' && (
        <TouchableOpacity style={styles.fab} onPress={handleNewNote}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'inbox' && styles.tabActive]}
          onPress={() => setSelectedTab('inbox')}
        >
          <Text style={[styles.tabText, selectedTab === 'inbox' && styles.tabTextActive]}>
            Inbox
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'archive' && styles.tabActive]}
          onPress={() => setSelectedTab('archive')}
        >
          <Text style={[styles.tabText, selectedTab === 'archive' && styles.tabTextActive]}>
            Archive
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'trash' && styles.tabActive]}
          onPress={() => setSelectedTab('trash')}
        >
          <Text style={[styles.tabText, selectedTab === 'trash' && styles.tabTextActive]}>
            Trash
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncDotSyncing: {
    backgroundColor: colors.accent,
  },
  syncDotPending: {
    backgroundColor: '#f59e0b',
  },
  syncDotOffline: {
    backgroundColor: '#ef4444',
  },
  syncDotConnected: {
    backgroundColor: '#22c55e',
  },
  syncDotConnecting: {
    backgroundColor: '#6366f1',
  },
  syncText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  noteItem: {
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  noteTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  localBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  localBadgeText: {
    fontSize: 10,
    color: '#f59e0b',
    fontWeight: '600',
  },
  notePreview: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  noteCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  categoryName: {
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    lineHeight: 30,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});

export default HomeScreen;
