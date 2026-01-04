import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme/colors';
import { SyncManager } from '../services/syncManager';
import type { Category, CreateCategoryDto } from '@flashpad/shared';

interface CategoryManagerScreenProps {
  navigation: any;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

function CategoryManagerScreen({ navigation }: CategoryManagerScreenProps) {
  const { api } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const syncManagerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    const syncManager = new SyncManager({ api });
    syncManagerRef.current = syncManager;
    fetchCategories();

    return () => {
      syncManager.destroy();
      syncManagerRef.current = null;
    };
  }, [api]);

  const fetchCategories = useCallback(async () => {
    if (!syncManagerRef.current) return;
    try {
      const cats = await syncManagerRef.current.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !syncManagerRef.current) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await syncManagerRef.current.updateCategory(editingId, {
          name: name.trim(),
          color: selectedColor,
        });
      } else {
        await syncManagerRef.current.createCategory({
          name: name.trim(),
          color: selectedColor,
        });
      }
      setName('');
      setSelectedColor(PRESET_COLORS[0]);
      setEditingId(null);
      await fetchCategories();
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setSelectedColor(category.color);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setSelectedColor(PRESET_COLORS[0]);
  };

  const handleDelete = (category: Category) => {
    Alert.alert(
      'Delete Category',
      `Delete "${category.name}"? Notes in this category will be uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!syncManagerRef.current) return;
            try {
              await syncManagerRef.current.deleteCategory(category.id);
              await fetchCategories();
            } catch (error) {
              console.error('Failed to delete category:', error);
            }
          },
        },
      ]
    );
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <View style={styles.categoryItem}>
      <View style={styles.categoryInfo}>
        <View style={[styles.categoryColor, { backgroundColor: item.color }]} />
        <View style={styles.categoryText}>
          <Text style={styles.categoryName}>{item.name}</Text>
          <Text style={styles.categoryCount}>
            {item.noteCount} {item.noteCount === 1 ? 'note' : 'notes'}
          </Text>
        </View>
      </View>
      <View style={styles.categoryActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEdit(item)}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="Category name"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          editable={!isSubmitting}
        />

        <View style={styles.colorPicker}>
          {PRESET_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorOption,
                { backgroundColor: color },
                selectedColor === color && styles.colorOptionSelected,
              ]}
              onPress={() => setSelectedColor(color)}
            />
          ))}
        </View>

        <View style={styles.formActions}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!name.trim() || isSubmitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!name.trim() || isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Add Category'}
            </Text>
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelEdit}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No categories yet</Text>
          <Text style={styles.emptySubtext}>
            Create categories to organize your notes
          </Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          contentContainerStyle={styles.list}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  formContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: colors.text,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceHover,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  categoryText: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  categoryCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  actionButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default CategoryManagerScreen;
