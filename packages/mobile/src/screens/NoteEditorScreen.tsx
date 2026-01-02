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
import { colors } from '../theme/colors';
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
  const textInputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const noteId = route.params?.noteId;
  const isNew = route.params?.isNew || !noteId;

  const fetchNote = useCallback(async () => {
    if (!noteId) {
      setIsLoading(false);
      return;
    }
    try {
      const fetchedNote = await api.getNote(noteId);
      setNote(fetchedNote);
      setContent(fetchedNote.content);
      setSelectedCategoryId(fetchedNote.categoryId);
    } catch (error) {
      console.error('Failed to fetch note:', error);
      Alert.alert('Error', 'Failed to load note');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  }, [api, noteId, navigation]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [api]);

  useEffect(() => {
    fetchNote();
    fetchCategories();
  }, [fetchNote, fetchCategories]);

  useEffect(() => {
    if (isNew) {
      textInputRef.current?.focus();
    }
  }, [isNew]);

  const saveNote = useCallback(async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      if (isNew) {
        const newNote = await api.createNote({
          content: content.trim(),
          categoryId: selectedCategoryId,
          deviceId: 'mobile',
        });
        setNote(newNote);
        setHasChanges(false);
        navigation.setParams({ noteId: newNote.id, isNew: false });
      } else if (noteId) {
        const updatedNote = await api.updateNote(noteId, {
          content: content.trim(),
          categoryId: selectedCategoryId,
          deviceId: 'mobile',
        });
        setNote(updatedNote);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  }, [api, content, selectedCategoryId, isNew, noteId, navigation]);

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
    if (!noteId) return;
    try {
      await api.archiveNote(noteId);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to archive note');
    }
  };

  const handleRestore = async () => {
    if (!noteId) return;
    try {
      await api.restoreNote(noteId);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to restore note');
    }
  };

  const handleTrash = async () => {
    if (!noteId) return;
    Alert.alert('Move to Trash', 'Are you sure you want to move this note to trash?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.trashNote(noteId);
            navigation.goBack();
          } catch (error) {
            Alert.alert('Error', 'Failed to move note to trash');
          }
        },
      },
    ]);
  };

  const handleDelete = async () => {
    if (!noteId) return;
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
              await api.deleteNotePermanently(noteId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
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
  }, [navigation, note, isNew, isSaving]);

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
              {isSaving ? 'Saving...' : 'Save Note'}
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
