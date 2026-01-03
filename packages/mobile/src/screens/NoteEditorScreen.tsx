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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
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
  const toast = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);

  const noteId = route.params?.noteId;
  const isNew = route.params?.isNew || !noteId;

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
      toast.error('Failed to load note');
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
        setNote(newNote);
        setHasChanges(false);
        navigation.setParams({ noteId: newNote.id, isNew: false });
      } else if (noteId) {
        const updatedNote = await syncManagerRef.current.updateNote(noteId, {
          content: content.trim(),
          categoryId: selectedCategoryId,
          deviceId: 'mobile',
        });
        setNote(updatedNote);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  }, [content, selectedCategoryId, isNew, noteId, navigation, toast]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (hasChanges && !isNew) {
        saveNote();
      }
    }, 2000);
  }, [hasChanges, isNew, saveNote]);

  const handleContentChange = (text: string) => {
    setContent(text);
    setHasChanges(true);
    if (!isNew) {
      debouncedSave();
    }
  };

  const handleArchive = async () => {
    if (!noteId || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.archiveNote(noteId);
      toast.success('Note archived');
      navigation.goBack();
    } catch (error) {
      toast.error('Failed to archive note');
    }
  };

  const handleRestore = async () => {
    if (!noteId || !syncManagerRef.current) return;
    try {
      await syncManagerRef.current.restoreNote(noteId);
      toast.success('Note restored');
      navigation.goBack();
    } catch (error) {
      toast.error('Failed to restore note');
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
            toast.success('Note moved to trash');
            navigation.goBack();
          } catch (error) {
            toast.error('Failed to move note to trash');
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
              toast.success('Note deleted permanently');
              navigation.goBack();
            } catch (error) {
              toast.error('Failed to delete note');
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
          {!isNew && note && (
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
  }, [navigation, note, isNew, isSaving, isOffline]);

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
      {isNew && (
        <View style={styles.newNoteActions}>
          <TouchableOpacity
            style={[styles.saveButton, !content.trim() && styles.saveButtonDisabled]}
            onPress={saveNote}
            disabled={!content.trim() || isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : isOffline ? 'Save Offline' : 'Save Note'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    padding: 20,
    fontSize: 16,
    lineHeight: 24,
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
  newNoteActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  saveButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceActive,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NoteEditorScreen;
