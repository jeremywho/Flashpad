import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  AppState,
  AppStateStatus,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { SyncManager, SyncStatus } from '../services/syncManager';
import type { Note, Category, NoteStatus } from '@flashpad/shared';
import { SignalRClient, ConnectionState } from '@flashpad/shared';
import { getApiUrl } from '../config';

interface HomeScreenProps {
  navigation: any;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  // Compare calendar days, not raw time difference
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = nowDay.getTime() - dateDay.getTime();
  const days = Math.round(diffTime / (1000 * 60 * 60 * 24));

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

interface SwipeableNoteItemProps {
  children: React.ReactNode;
  onSwipeLeft: () => void;
  enabled: boolean;
  actionText?: string;
}

function RightAction({
  drag,
  onPress,
  actionText = 'Trash',
}: {
  drag: SharedValue<number>;
  onPress: () => void;
  actionText?: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    // drag.value is negative when swiping left
    // Only show when actually swiping (drag < -5 to avoid flash)
    const opacity = Math.min(1, Math.max(0, (-drag.value - 5) / 30));
    const scale = Math.min(1, Math.max(0.5, -drag.value / 100));
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Reanimated.View style={[styles.swipeAction, animatedStyle]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.swipeActionTouchable}
      >
        <Text style={styles.swipeActionText}>{actionText}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

function SwipeableNoteItem({ children, onSwipeLeft, enabled, actionText }: SwipeableNoteItemProps) {
  const swipeableRef = useRef<React.ElementRef<typeof ReanimatedSwipeable>>(null);

  const renderRightActions = (
    _progress: SharedValue<number>,
    drag: SharedValue<number>
  ) => {
    return (
      <RightAction
        drag={drag}
        onPress={() => {
          swipeableRef.current?.close();
          onSwipeLeft();
        }}
        actionText={actionText}
      />
    );
  };

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      friction={2}
      overshootRight={false}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [showBatchCategoryPicker, setShowBatchCategoryPicker] = useState(false);
  const syncManagerRef = useRef<SyncManager | null>(null);
  const signalRRef = useRef<SignalRClient | null>(null);
  const fetchNotesRef = useRef<((tab?: TabType, categoryId?: string | null) => Promise<void>) | undefined>(undefined);

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


  const fetchNotes = useCallback(async (
    overrideTab?: TabType,
    overrideCategoryId?: string | null
  ) => {
    if (!syncManagerRef.current) return;

    // Use override values if provided, otherwise use state
    const tab = overrideTab ?? selectedTab;
    const categoryId = overrideCategoryId !== undefined ? overrideCategoryId : selectedCategoryId;

    try {
      const localNotes = await syncManagerRef.current.getNotes({
        status: getStatusForTab(tab),
        categoryId: categoryId || undefined,
      });

      // Filter notes based on view
      let filteredNotes = localNotes;

      // In Inbox view (no category selected), only show uncategorized notes
      if (tab === 'inbox' && !categoryId) {
        filteredNotes = filteredNotes.filter((n) => !n.categoryId);
      }

      // Filter by search query if present
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filteredNotes = filteredNotes.filter((n) =>
          n.content.toLowerCase().includes(query)
        );
      }

      setNotes(filteredNotes);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedTab, searchQuery, selectedCategoryId]);

  const fetchCategories = useCallback(async () => {
    if (!syncManagerRef.current) return;

    try {
      const cats = await syncManagerRef.current.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  // Keep fetchNotesRef updated with the latest fetchNotes function
  useEffect(() => {
    fetchNotesRef.current = fetchNotes;
  }, [fetchNotes]);

  // Initialize SyncManager
  useEffect(() => {
    const syncManager = new SyncManager({
      api,
      onSyncStatusChange: setSyncStatus,
      onPendingCountChange: setPendingCount,
      onDataRefresh: () => {
        // Use ref to get the latest fetchNotes function to avoid stale closure
        fetchNotesRef.current?.();
        fetchCategories();
      },
    });

    syncManagerRef.current = syncManager;

    // Perform initial sync
    syncManager.initialSync().then(() => {
      fetchNotesRef.current?.();
      fetchCategories();
    });

    return () => {
      syncManager.destroy();
      syncManagerRef.current = null;
    };
  }, [api, fetchCategories]);

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

    const signalRUrl = getApiUrl();
    console.log('SignalR connecting to:', signalRUrl);

    const client = new SignalRClient({
      baseUrl: signalRUrl,
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
        // Move updated note to top (since it has the newest updatedAt)
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.id !== note.id);
          if (shouldShowNoteInCurrentView(note)) {
            return [note, ...filtered];
          }
          return filtered;
        });
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

    // Reconnect SignalR when app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && signalRRef.current && !signalRRef.current.isConnected()) {
        console.log('App foregrounded, reconnecting SignalR...');
        signalRRef.current.start().catch(console.error);
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription.remove();
      client.stop();
      signalRRef.current = null;
    };
  }, [api, shouldShowNoteInCurrentView, fetchCategories]);

  const onRefresh = () => {
    setRefreshing(true);
    // Explicitly pass current tab and category to avoid stale closure issues
    fetchNotes(selectedTab, selectedCategoryId);
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

  const renderNote = useCallback(({ item }: { item: Note }) => {
    const isSelected = selectedNoteIds.has(item.id);
    // Enable swipe for all notes except during selection mode
    const swipeEnabled = !isSelectionMode;
    // Use different handler and text for trash items
    const isTrashView = selectedTab === 'trash';

    const noteContent = (
      <TouchableOpacity
        style={[styles.noteItem, isSelected && styles.noteItemSelected]}
        onPress={() => {
          if (isSelectionMode) {
            toggleNoteSelection(item.id);
          } else {
            handleNotePress(item);
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            enterSelectionMode(item.id);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.noteHeader}>
          {isSelectionMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
          )}
          <Text style={[styles.noteTitle, isSelectionMode && styles.noteTitleWithCheckbox]} numberOfLines={1}>
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
        <Text style={[styles.notePreview, isSelectionMode && styles.notePreviewWithCheckbox]} numberOfLines={2}>
          {getPreview(item.content)}
        </Text>
        {item.categoryName && (
          <View style={[styles.noteCategory, isSelectionMode && styles.noteCategoryWithCheckbox]}>
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

    return (
      <SwipeableNoteItem
        onSwipeLeft={() =>
          isTrashView
            ? handleSwipeToPermanentDelete(item.id)
            : handleSwipeToTrash(item.id)
        }
        enabled={swipeEnabled}
        actionText={isTrashView ? 'Delete' : 'Trash'}
      >
        {noteContent}
      </SwipeableNoteItem>
    );
  }, [isSelectionMode, selectedNoteIds, selectedTab, handleSwipeToTrash, handleSwipeToPermanentDelete, toggleNoteSelection, handleNotePress, enterSelectionMode]);

  const getTabTitle = () => {
    if (selectedCategoryId) {
      const category = categories.find((c) => c.id === selectedCategoryId);
      return category?.name || 'Category';
    }
    switch (selectedTab) {
      case 'inbox':
        return 'Inbox';
      case 'archive':
        return 'Archive';
      case 'trash':
        return 'Trash';
    }
  };

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : null;

  const handleCategoryFilterSelect = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setShowCategoryFilter(false);
    // Explicitly fetch with the new category to avoid stale closure issues
    setIsLoading(true);
    fetchNotes(selectedTab, categoryId);
  };

  const handleTabChange = (tab: TabType) => {
    setSelectedTab(tab);
    setSelectedCategoryId(null); // Clear category filter when switching tabs
    exitSelectionMode(); // Exit selection mode when switching tabs
    setShowCategoryFilter(false);
    // Explicitly fetch with the new tab value to avoid stale closure issues
    setIsLoading(true);
    fetchNotes(tab, null);
  };

  const handleStatusSelect = (tab: TabType) => {
    handleTabChange(tab);
  };

  // Selection mode handlers
  const enterSelectionMode = (noteId: string) => {
    setIsSelectionMode(true);
    setSelectedNoteIds(new Set([noteId]));
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedNoteIds(new Set());
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
        // Exit selection mode if no notes selected
        if (newSet.size === 0) {
          setIsSelectionMode(false);
        }
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const selectAllNotes = () => {
    setSelectedNoteIds(new Set(notes.map((n) => n.id)));
  };

  const handleBatchCategoryMove = async (categoryId: string | undefined) => {
    if (!syncManagerRef.current || selectedNoteIds.size === 0) return;

    setShowBatchCategoryPicker(false);

    try {
      const promises = Array.from(selectedNoteIds).map((noteId) => {
        return syncManagerRef.current!.moveNoteToCategory(noteId, categoryId);
      });

      await Promise.all(promises);
      exitSelectionMode();
      fetchNotes();
      fetchCategories();
    } catch (error) {
      console.error('Failed to move notes:', error);
    }
  };

  const handleSwipeToTrash = async (noteId: string) => {
    if (!syncManagerRef.current) return;
    try {
      await syncManagerRef.current.trashNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      fetchCategories();
    } catch (error) {
      console.error('Failed to trash note:', error);
    }
  };

  const handleSwipeToPermanentDelete = async (noteId: string) => {
    if (!syncManagerRef.current) return;
    try {
      await syncManagerRef.current.deleteNotePermanently(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (error) {
      console.error('Failed to permanently delete note:', error);
    }
  };

  const handleEmptyTrash = () => {
    if (notes.length === 0) return;

    Alert.alert(
      'Empty Trash',
      `Are you sure you want to permanently delete ${notes.length} note${notes.length !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            if (!syncManagerRef.current) return;
            try {
              const promises = notes.map((note) =>
                syncManagerRef.current!.deleteNotePermanently(note.id)
              );
              await Promise.all(promises);
              setNotes([]);
            } catch (error) {
              console.error('Failed to empty trash:', error);
            }
          },
        },
      ]
    );
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
          <TouchableOpacity
            style={styles.headerTitleButton}
            onPress={() => setShowCategoryFilter(true)}
          >
            {selectedCategory && (
              <View
                style={[
                  styles.headerCategoryDot,
                  { backgroundColor: selectedCategory.color },
                ]}
              />
            )}
            <Text style={styles.headerTitle}>{getTabTitle()}</Text>
            <Text style={styles.headerTitleArrow}>▼</Text>
          </TouchableOpacity>
          {renderSyncStatus()}
        </View>
        <View style={styles.headerActions}>
          {selectedTab === 'trash' && notes.length > 0 && (
            <TouchableOpacity
              style={styles.emptyTrashButton}
              onPress={handleEmptyTrash}
            >
              <Text style={styles.emptyTrashButtonText}>Empty</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('CategoryManager')}
          >
            <Text style={styles.headerIcon}>≡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Account')}
          >
            <View style={styles.profileIcon}>
              <View style={styles.profileIconHead} />
              <View style={styles.profileIconBody} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.searchClear}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.searchClearText}>×</Text>
          </TouchableOpacity>
        )}
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
          getItemLayout={(data, index) => ({
            length: 100,
            offset: 100 * index,
            index,
          })}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={15}
          windowSize={10}
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
                {searchQuery
                  ? `No notes match "${searchQuery}"`
                  : selectedTab === 'trash'
                  ? 'Trash is empty'
                  : selectedTab === 'archive'
                  ? 'No archived notes'
                  : 'No notes yet'}
              </Text>
              {selectedTab === 'inbox' && !searchQuery && (
                <TouchableOpacity style={styles.emptyButton} onPress={handleNewNote}>
                  <Text style={styles.emptyButtonText}>Create your first note</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          contentContainerStyle={notes.length === 0 ? styles.emptyList : undefined}
        />
      )}

      {selectedTab === 'inbox' && !isSelectionMode && (
        <TouchableOpacity style={styles.fab} onPress={handleNewNote}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Selection Action Bar */}
      {isSelectionMode && (
        <View style={styles.selectionBar}>
          <View style={styles.selectionBarLeft}>
            <TouchableOpacity onPress={exitSelectionMode} style={styles.selectionBarButton}>
              <Text style={styles.selectionBarButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.selectionBarCount}>
              {selectedNoteIds.size} selected
            </Text>
          </View>
          <View style={styles.selectionBarRight}>
            <TouchableOpacity onPress={selectAllNotes} style={styles.selectionBarButton}>
              <Text style={styles.selectionBarButtonText}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowBatchCategoryPicker(true)}
              style={[styles.selectionBarButton, styles.selectionBarPrimary]}
            >
              <Text style={styles.selectionBarPrimaryText}>Move to...</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Category Filter Modal */}
      <Modal
        visible={showCategoryFilter}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryFilter(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCategoryFilter(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>View</Text>
              <TouchableOpacity onPress={() => setShowCategoryFilter(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Status Section */}
            <View style={styles.modalSectionHeader}>
              <Text style={styles.modalSectionTitle}>Status</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.filterOption,
                selectedTab === 'inbox' && !selectedCategoryId && styles.filterOptionSelected,
              ]}
              onPress={() => handleStatusSelect('inbox')}
            >
              <Text style={styles.filterOptionIcon}>📥</Text>
              <Text
                style={[
                  styles.filterOptionText,
                  selectedTab === 'inbox' && !selectedCategoryId && styles.filterOptionTextSelected,
                ]}
              >
                Inbox
              </Text>
              {selectedTab === 'inbox' && !selectedCategoryId && (
                <Text style={styles.filterOptionCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterOption,
                selectedTab === 'archive' && styles.filterOptionSelected,
              ]}
              onPress={() => handleStatusSelect('archive')}
            >
              <Text style={styles.filterOptionIcon}>📦</Text>
              <Text
                style={[
                  styles.filterOptionText,
                  selectedTab === 'archive' && styles.filterOptionTextSelected,
                ]}
              >
                Archive
              </Text>
              {selectedTab === 'archive' && (
                <Text style={styles.filterOptionCheck}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterOption,
                selectedTab === 'trash' && styles.filterOptionSelected,
              ]}
              onPress={() => handleStatusSelect('trash')}
            >
              <Text style={styles.filterOptionIcon}>🗑</Text>
              <Text
                style={[
                  styles.filterOptionText,
                  selectedTab === 'trash' && styles.filterOptionTextSelected,
                ]}
              >
                Trash
              </Text>
              {selectedTab === 'trash' && (
                <Text style={styles.filterOptionCheck}>✓</Text>
              )}
            </TouchableOpacity>

            {/* Categories Section - only show for inbox */}
            {selectedTab === 'inbox' && categories.length > 0 && (
              <>
                <View style={styles.modalSectionHeader}>
                  <Text style={styles.modalSectionTitle}>Categories</Text>
                </View>
                <FlatList
                  data={categories}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.filterOption,
                        selectedCategoryId === item.id && styles.filterOptionSelected,
                      ]}
                      onPress={() => handleCategoryFilterSelect(item.id)}
                    >
                      <View
                        style={[styles.filterOptionDot, { backgroundColor: item.color }]}
                      />
                      <Text
                        style={[
                          styles.filterOptionText,
                          selectedCategoryId === item.id && styles.filterOptionTextSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {selectedCategoryId === item.id && (
                        <Text style={styles.filterOptionCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Batch Category Picker Modal */}
      <Modal
        visible={showBatchCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBatchCategoryPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowBatchCategoryPicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Move {selectedNoteIds.size} note{selectedNoteIds.size !== 1 ? 's' : ''} to...
              </Text>
              <TouchableOpacity onPress={() => setShowBatchCategoryPicker(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[
                { id: undefined, name: 'Inbox', color: undefined },
                ...categories,
              ]}
              keyExtractor={(item) => item.id || 'inbox'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.filterOption}
                  onPress={() => handleBatchCategoryMove(item.id)}
                >
                  {item.color ? (
                    <View
                      style={[styles.filterOptionDot, { backgroundColor: item.color }]}
                    />
                  ) : (
                    <View style={[styles.filterOptionDot, styles.filterOptionDotInbox]} />
                  )}
                  <Text style={styles.filterOptionText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
    gap: 8,
  },
  emptyTrashButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 4,
  },
  emptyTrashButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    color: colors.accent,
  },
  profileIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  profileIconHead: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    position: 'absolute',
    top: 3,
  },
  profileIconBody: {
    width: 16,
    height: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: colors.accent,
  },
  searchContainer: {
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingRight: 40,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchClear: {
    position: 'absolute',
    right: 26,
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceHover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchClearText: {
    fontSize: 18,
    color: colors.textSecondary,
    lineHeight: 20,
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
  swipeAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeActionTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    bottom: 30,
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
  // Header title button styles
  headerTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  headerTitleArrow: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: 6,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '500',
  },
  modalSectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterOptionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionSelected: {
    backgroundColor: colors.surfaceActive,
  },
  filterOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  filterOptionDotInbox: {
    backgroundColor: colors.accent,
  },
  filterOptionText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  filterOptionTextSelected: {
    fontWeight: '600',
    color: colors.accent,
  },
  filterOptionCount: {
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 8,
  },
  filterOptionCheck: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
  },
  // Selection mode styles
  noteItemSelected: {
    backgroundColor: colors.surfaceActive,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noteTitleWithCheckbox: {
    flex: 1,
  },
  notePreviewWithCheckbox: {
    marginLeft: 34,
  },
  noteCategoryWithCheckbox: {
    marginLeft: 34,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectionBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectionBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectionBarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionBarButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  selectionBarCount: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  selectionBarPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 6,
  },
  selectionBarPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default HomeScreen;
