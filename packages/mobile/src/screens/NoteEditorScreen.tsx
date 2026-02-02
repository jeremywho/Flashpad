import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { SyncManager } from '../services/syncManager';
import { getLocalNote } from '../services/database';
import type { Note, Category, NoteStatus } from '@flashpad/shared';

interface NoteEditorScreenProps {
  navigation: any;
  route: {
    params?: {
      noteId?: string;
      isNew?: boolean;
    };
  };
}

function NoteEditorScreen({ navigation, route }: NoteEditorScreenProps) {
  const { api } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);
  const isMountedRef = useRef(true);

  const noteId = route.params?.noteId;
  const isNew = route.params?.isNew || !noteId;

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Initialize SyncManager
  useEffect(() => {
    const syncManager = new SyncManager({
      api,
      onSyncStatusChange: (status) => {
        setIsOffline(status === 'offline');
      },
    });
    syncManagerRef.current = syncManager;

    return () => {
      syncManager.destroy();
      syncManagerRef.current = null;
    };
  }, [api]);

  const fetchNote = useCallback(async () => {
    if (!noteId) {
      setIsLoading(false);
      return;
    }
    try {
      // First try to get from local storage
      const localNote = await getLocalNote(noteId);
      if (localNote) {
        setNote(localNote);
        setContent(localNote.content);
        setSelectedCategoryId(localNote.categoryId);
        setIsLoading(false);
        return;
      }

      // Fall back to API if not in local storage
      const fetchedNote = await api.getNote(noteId);
      setNote(fetchedNote);
      setContent(fetchedNote.content);
      setSelectedCategoryId(fetchedNote.categoryId);
    } catch (error) {
      console.error('Failed to fetch note:', error);
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  }, [api, noteId, navigation]);

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
    fetchNote();
  }, [fetchNote]);

  useEffect(() => {
    if (syncManagerRef.current) {
      fetchCategories();
    }
  }, [fetchCategories]);

  useEffect(() => {
    if (isNew) {
      textInputRef.current?.focus();
    }
  }, [isNew]);

  const saveNote = useCallback(async () => {
    if (!content.trim() || !syncManagerRef.current) return;

    setIsSaving(true);
    try {
      if (isNew) {
        const newNote = await syncManagerRef.current.createNote({
          content: content.trim(),
          categoryId: selectedCategoryId,
          deviceId: 'mobile',
        });
        // Only update state if still mounted
        if (isMountedRef.current) {
          setNote(newNote);
          setHasChanges(false);
          navigation.setParams({ noteId: newNote.id, isNew: false });
        }
      } else if (noteId) {
        const updatedNote = await syncManagerRef.current.updateNote(noteId, {
          content: content.trim(),
          categoryId: selectedCategoryId,
          deviceId: 'mobile',
        });
        // Only update state if still mounted
        if (isMountedRef.current) {
          setNote(updatedNote);
          setHasChanges(false);
        }
      }
    } catch (error) {
      console.error('Failed to save note:', error);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [content, selectedCategoryId, isNew, noteId, navigation]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (hasChanges) {
        saveNote();
      }
    }, 2000);
  }, [hasChanges, saveNote]);

  const handleContentChange = (text: string) => {
    setContent(text);
    setHasChanges(true);
    // Auto-save for both new and existing notes
    if (text.trim()) {
      debouncedSave();
    }
  };

  const handleCategoryChange = async (categoryId: string | undefined) => {
    setSelectedCategoryId(categoryId);
    setShowCategoryPicker(false);

    // Save immediately if editing existing note
    if (!isNew && noteId && syncManagerRef.current) {
      setIsSaving(true);
      try {
        const updatedNote = await syncManagerRef.current.moveNoteToCategory(noteId, categoryId);
        setNote(updatedNote);
      } catch (error) {
        console.error('Failed to update category:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  const handleArchive = async () => {
    if (!noteId || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.archiveNote(noteId);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to archive note:', error);
    }
  };

  const handleRestore = async () => {
    if (!noteId || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.restoreNote(noteId);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to restore note:', error);
    }
  };

  const handleTrash = async () => {
    if (!noteId || !syncManagerRef.current) return;
    Alert.alert('Move to Trash', 'Are you sure you want to move this note to trash?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash',
        style: 'destructive',
        onPress: async () => {
          try {
            await syncManagerRef.current?.trashNote(noteId);
            navigation.goBack();
          } catch (error) {
            console.error('Failed to move note to trash:', error);
          }
        },
      },
    ]);
  };

  const handleDelete = async () => {
    if (!noteId || !syncManagerRef.current) return;
    Alert.alert(
      'Delete Permanently',
      'This action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await syncManagerRef.current?.deleteNotePermanently(noteId);
              navigation.goBack();
            } catch (error) {
              console.error('Failed to delete note:', error);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
          {isSaving && <Text style={styles.savingText}>Saving...</Text>}
          {isNew ? (
            <TouchableOpacity
              onPress={() => {
                if (content.trim()) {
                  saveNote();
                }
                navigation.goBack();
              }}
              style={styles.headerButton}
            >
              <Text style={styles.headerButtonText}>Done</Text>
            </TouchableOpacity>
          ) : note && (
            <>
              {note.status === 0 && (
                <TouchableOpacity onPress={handleArchive} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Archive</Text>
                </TouchableOpacity>
              )}
              {note.status === 1 && (
                <TouchableOpacity onPress={handleRestore} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Restore</Text>
                </TouchableOpacity>
              )}
              {note.status === 2 ? (
                <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
                  <Text style={[styles.headerButtonText, styles.dangerText]}>Delete</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleTrash} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Trash</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ),
    });
  }, [navigation, note, isNew, isSaving, isOffline, content, saveNote]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {note?.id.startsWith('local_') && (
        <View style={styles.localNoteBanner}>
          <Text style={styles.localNoteBannerText}>
            This note hasn't been synced yet
          </Text>
        </View>
      )}

      {/* Category Picker Row */}
      <TouchableOpacity
        style={styles.categoryRow}
        onPress={() => setShowCategoryPicker(true)}
      >
        {selectedCategory && (
          <View
            style={[
              styles.categoryDot,
              { backgroundColor: selectedCategory.color },
            ]}
          />
        )}
        <Text style={selectedCategory ? styles.categoryName : styles.categoryNameMuted}>
          {selectedCategory ? selectedCategory.name : 'Inbox'}
        </Text>
        <Text style={styles.categoryArrow}>›</Text>
      </TouchableOpacity>

      <TextInput
        ref={textInputRef}
        style={styles.editor}
        value={content}
        onChangeText={handleContentChange}
        placeholder="Start typing your note..."
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
        autoFocus={isNew}
      />

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCategoryPicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ id: undefined, name: 'Inbox', color: undefined }, ...categories]}
              keyExtractor={(item) => item.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.categoryOption,
                    selectedCategoryId === item.id && styles.categoryOptionSelected,
                  ]}
                  onPress={() => handleCategoryChange(item.id)}
                >
                  {item.color ? (
                    <View
                      style={[styles.categoryOptionDot, { backgroundColor: item.color }]}
                    />
                  ) : (
                    <View style={[styles.categoryOptionDot, styles.categoryOptionDotEmpty]} />
                  )}
                  <Text
                    style={[
                      styles.categoryOptionText,
                      selectedCategoryId === item.id && styles.categoryOptionTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {selectedCategoryId === item.id && (
                    <Text style={styles.categoryOptionCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  localNoteBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.3)',
  },
  localNoteBannerText: {
    color: '#f59e0b',
    fontSize: 13,
    textAlign: 'center',
  },
  editor: {
    flex: 1,
    padding: 24,
    fontSize: 18,
    lineHeight: 30,
    letterSpacing: 0.2,
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerButtonText: {
    color: colors.accent,
    fontSize: 16,
  },
  dangerText: {
    color: colors.danger,
  },
  savingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  offlineBadgeText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  // Category picker row
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  categoryNameMuted: {
    fontSize: 14,
    color: colors.textMuted,
  },
  categoryArrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 8,
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
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryOptionSelected: {
    backgroundColor: colors.surfaceActive,
  },
  categoryOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryOptionDotEmpty: {
    backgroundColor: colors.border,
  },
  categoryOptionText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  categoryOptionTextSelected: {
    fontWeight: '600',
    color: colors.accent,
  },
  categoryOptionCheck: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
  },
});

export default NoteEditorScreen;
