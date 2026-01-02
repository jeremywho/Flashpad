import { useState } from 'react';
import { Category, CreateCategoryDto } from '@shared/types';

interface CategoryManagerProps {
  categories: Category[];
  onCreateCategory: (data: CreateCategoryDto) => Promise<void>;
  onUpdateCategory: (id: string, data: CreateCategoryDto) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onClose: () => void;
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

export default function CategoryManager({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onClose,
}: CategoryManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingId) {
        await onUpdateCategory(editingId, { name: name.trim(), color });
        setEditingId(null);
      } else {
        await onCreateCategory({ name: name.trim(), color });
      }
      setName('');
      setColor(PRESET_COLORS[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setColor(PRESET_COLORS[0]);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Notes in this category will be uncategorized.')) {
      return;
    }
    try {
      await onDeleteCategory(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  return (
    <div className="category-manager-overlay" onClick={onClose}>
      <div className="category-manager" onClick={(e) => e.stopPropagation()}>
        <div className="category-manager-header">
          <h2>Manage Categories</h2>
          <button className="category-manager-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form className="category-manager-form" onSubmit={handleSubmit}>
          <div className="category-manager-input-row">
            <input
              type="text"
              className="category-manager-input"
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="category-manager-submit"
              disabled={!name.trim() || isSubmitting}
            >
              {editingId ? 'Update' : 'Add'}
            </button>
            {editingId && (
              <button
                type="button"
                className="category-manager-cancel"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            )}
          </div>

          <div className="category-manager-colors">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`category-manager-color ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {error && <p className="category-manager-error">{error}</p>}
        </form>

        <div className="category-manager-list">
          {categories.length === 0 ? (
            <p className="category-manager-empty">No categories yet</p>
          ) : (
            categories.map((category) => (
              <div key={category.id} className="category-manager-item">
                <div className="category-manager-item-info">
                  <span
                    className="category-manager-item-color"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="category-manager-item-name">{category.name}</span>
                  <span className="category-manager-item-count">
                    {category.noteCount} {category.noteCount === 1 ? 'note' : 'notes'}
                  </span>
                </div>
                <div className="category-manager-item-actions">
                  <button
                    className="category-manager-item-btn"
                    onClick={() => handleEdit(category)}
                  >
                    Edit
                  </button>
                  <button
                    className="category-manager-item-btn danger"
                    onClick={() => handleDelete(category.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
