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
import Markdown from 'react-native-marked';
import { Archive, Inbox, RotateCcw, Trash2, ChevronDown, Eye, Pencil } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { SyncManager } from '../services/syncManager';
import { getLocalNote } from '../services/database';
import type { Note, Category, NoteStatus } from '@flashpad/shared';
import { getOrCreateMobileDeviceId } from '../services/deviceId';

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
  const [previewMode, setPreviewMode] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
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
    let cancelled = false;
    let syncManager: SyncManager | null = null;

    getOrCreateMobileDeviceId()
      .then((deviceId) => {
        if (cancelled) {
          return;
        }

        syncManager = new SyncManager({
          api,
          deviceId,
          onSyncStatusChange: (status) => {
            setIsOffline(status === 'offline');
          },
          onConflict: (conflictedNoteId, serverVersion) => {
            if (conflictedNoteId === noteId) {
              setConflictMessage(`This note changed on another device. Latest version v${serverVersion} was loaded.`);
            }
          },
        });
        syncManagerRef.current = syncManager;
      })
      .catch((error) => {
        console.error('Failed to initialize note editor device ID:', error);
      });

    return () => {
      cancelled = true;
      syncManager?.destroy();
      syncManagerRef.current = null;
    };
  }, [api, noteId]);

  useEffect(() => {
    setConflictMessage(null);
  }, [noteId]);

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
    setConflictMessage(null);
    try {
      if (isNew) {
        const newNote = await syncManagerRef.current.createNote({
          content: content.trim(),
          categoryId: selectedCategoryId,
        });
        // Only update state if still mounted
        if (isMountedRef.current) {
          setNote(newNote);
          setContent(newNote.content);
          setSelectedCategoryId(newNote.categoryId);
          setHasChanges(false);
          setConflictMessage(null);
          navigation.setParams({ noteId: newNote.id, isNew: false });
        }
      } else if (noteId) {
        const updatedNote = await syncManagerRef.current.updateNote(noteId, {
          content: content.trim(),
          categoryId: selectedCategoryId,
        });
        // Only update state if still mounted
        if (isMountedRef.current) {
          setNote(updatedNote);
          setContent(updatedNote.content);
          setSelectedCategoryId(updatedNote.categoryId);
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
    if (!isNew && noteId && note && syncManagerRef.current) {
      setIsSaving(true);
      try {
        const updatedNote = await syncManagerRef.current.updateNote(noteId, {
          content,
          categoryId,
        });
        setNote(updatedNote);
        setContent(updatedNote.content);
        setSelectedCategoryId(updatedNote.categoryId);
        setHasChanges(false);
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

  const charCount = content.length;
  const lineCount = content.split('\n').length;
  const noteVersion = note?.version || 1;

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
                <TouchableOpacity onPress={handleArchive} style={styles.ghostButton}>
                  <Archive size={20} strokeWidth={1.75} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              {note.status === 1 && (
                <TouchableOpacity onPress={handleRestore} style={styles.ghostButton}>
                  <RotateCcw size={20} strokeWidth={1.75} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              {note.status === 2 ? (
                <TouchableOpacity onPress={handleDelete} style={styles.ghostButton}>
                  <Trash2 size={20} strokeWidth={1.75} color={colors.danger} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleTrash} style={styles.ghostButton}>
                  <Trash2 size={20} strokeWidth={1.75} color={colors.textMuted} />
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

      {conflictMessage && (
        <View style={styles.conflictBanner}>
          <Text style={styles.conflictBannerText}>{conflictMessage}</Text>
        </View>
      )}

      {/* Category Picker Row + Edit/Preview Toggle */}
      <View style={styles.toolbarRow}>
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
          <ChevronDown size={14} strokeWidth={1.75} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, !previewMode && styles.modeTabActive]}
            onPress={() => setPreviewMode(false)}
          >
            <Pencil size={14} strokeWidth={1.75} color={!previewMode ? colors.accent : colors.textMuted} />
            <Text style={[styles.modeTabText, !previewMode && styles.modeTabTextActive]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, previewMode && styles.modeTabActive]}
            onPress={() => setPreviewMode(true)}
          >
            <Eye size={14} strokeWidth={1.75} color={previewMode ? colors.accent : colors.textMuted} />
            <Text style={[styles.modeTabText, previewMode && styles.modeTabTextActive]}>Preview</Text>
          </TouchableOpacity>
        </View>
      </View>

      {previewMode ? (
        content.trim() ? (
          <Markdown
            value={content}
            theme={markdownTheme}
            styles={markdownStyles}
            flatListProps={{
              style: styles.previewContainer,
              contentContainerStyle: styles.previewContent,
            }}
          />
        ) : (
          <View style={[styles.previewContainer, styles.previewContent]}>
            <Text style={styles.previewPlaceholder}>Nothing to preview</Text>
          </View>
        )
      ) : (
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
      )}

      {/* Editor footer bar */}
      {!isNew && (
        <View style={styles.editorFooter}>
          <Text style={styles.editorFooterText}>
            v{noteVersion} · {charCount} chars · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </Text>
        </View>
      )}

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

const markdownTheme = {
  colors: {
    code: colors.surfaceElevated,
    link: colors.accent,
    text: colors.text,
    border: colors.border,
  },
  spacing: {
    xs: 2,
    s: 4,
    m: 8,
    l: 16,
  },
};

const markdownStyles = {
  text: {
    fontSize: 18,
    lineHeight: 30,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  h1: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.semiBold,
  },
  h2: {
    color: colors.text,
    fontSize: 24,
    fontFamily: fonts.semiBold,
  },
  h3: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.medium,
  },
  h4: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.medium,
  },
  link: {
    color: colors.accent,
  },
  strong: {
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 12,
    marginVertical: 8,
  },
  codespan: {
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  code: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 8,
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCell: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 12,
  },
  list: {
    marginVertical: 4,
  },
  li: {
    marginVertical: 2,
  },
};

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
  conflictBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.24)',
  },
  conflictBannerText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  editor: {
    flex: 1,
    padding: 24,
    fontSize: 18,
    lineHeight: 30,
    letterSpacing: 0.2,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.medium,
  },
  ghostButton: {
    width: 36,
    height: 36,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontFamily: fonts.mono,
  },
  editorFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  editorFooterText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#404040',
  },
  // Toolbar row
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 2,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  modeTabActive: {
    backgroundColor: colors.surfaceElevated,
  },
  modeTabText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  modeTabTextActive: {
    color: colors.accent,
  },
  previewContainer: {
    flex: 1,
    padding: 24,
  },
  previewContent: {
    paddingBottom: 40,
  },
  previewPlaceholder: {
    color: colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
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
    fontFamily: fonts.medium,
  },
  categoryNameMuted: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
  categoryArrow: {
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
