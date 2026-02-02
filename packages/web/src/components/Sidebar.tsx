import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Category } from '@shared/types';

interface SidebarProps {
  categories: Category[];
  selectedView: 'inbox' | 'archive' | 'trash' | string;
  onViewChange: (view: 'inbox' | 'archive' | 'trash' | string) => void;
  onManageCategories: () => void;
  onNewNoteInCategory?: (categoryId: string) => void;
  inboxCount: number;
  archiveCount: number;
  trashCount: number;
  style?: React.CSSProperties;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  categoryId: string;
  categoryName: string;
}

export default function Sidebar({
  categories,
  selectedView,
  onViewChange,
  onManageCategories,
  onNewNoteInCategory,
  inboxCount,
  archiveCount,
  trashCount,
  style,
}: SidebarProps) {
  const navigate = useNavigate();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    categoryId: '',
    categoryName: '',
  });

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu((prev) => ({ ...prev, visible: false }));
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  const handleCategoryContextMenu = (e: React.MouseEvent, category: Category) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      categoryId: category.id,
      categoryName: category.name,
    });
  };

  const handleNewNoteInCategory = () => {
    if (onNewNoteInCategory && contextMenu.categoryId) {
      onNewNoteInCategory(contextMenu.categoryId);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-header">
        <h1 className="sidebar-logo">Flashpad</h1>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <button
            className={`sidebar-item ${selectedView === 'inbox' ? 'active' : ''}`}
            onClick={() => onViewChange('inbox')}
          >
            <span className="sidebar-icon">&#128229;</span>
            <span className="sidebar-label">Inbox</span>
            {inboxCount > 0 && <span className="sidebar-count">{inboxCount}</span>}
          </button>

          <button
            className={`sidebar-item ${selectedView === 'archive' ? 'active' : ''}`}
            onClick={() => onViewChange('archive')}
          >
            <span className="sidebar-icon">&#128451;</span>
            <span className="sidebar-label">Archive</span>
            {archiveCount > 0 && <span className="sidebar-count">{archiveCount}</span>}
          </button>

          <button
            className={`sidebar-item ${selectedView === 'trash' ? 'active' : ''}`}
            onClick={() => onViewChange('trash')}
          >
            <span className="sidebar-icon">&#128465;</span>
            <span className="sidebar-label">Trash</span>
            {trashCount > 0 && <span className="sidebar-count">{trashCount}</span>}
          </button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">Categories</div>
          {categories.map((category) => (
            <button
              key={category.id}
              className={`sidebar-item ${selectedView === category.id ? 'active' : ''}`}
              onClick={() => onViewChange(category.id)}
              onContextMenu={(e) => handleCategoryContextMenu(e, category)}
            >
              <span
                className="sidebar-color-dot"
                style={{ backgroundColor: category.color }}
              />
              <span className="sidebar-label">{category.name}</span>
              {category.noteCount > 0 && (
                <span className="sidebar-count">{category.noteCount}</span>
              )}
            </button>
          ))}
          <button className="sidebar-add-category" onClick={onManageCategories}>
            <span>+</span>
            <span>Manage Categories</span>
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={() => navigate('/app/settings')}>
          <span className="sidebar-icon">&#9881;</span>
          <span className="sidebar-label">Settings</span>
        </button>
        <button className="sidebar-item" onClick={() => navigate('/app/account')}>
          <span className="sidebar-icon">&#128100;</span>
          <span className="sidebar-label">Account</span>
        </button>
      </div>

      {contextMenu.visible && (
        <div
          className="sidebar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="sidebar-context-menu-item"
            onClick={handleNewNoteInCategory}
          >
            <span className="sidebar-context-menu-icon">+</span>
            <span>New note in "{contextMenu.categoryName}"</span>
          </button>
        </div>
      )}
    </aside>
  );
}
