import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Category, Note } from '@shared/types';
import { getNoteCardText, nextCategoryColor } from '@shared/index';
import { Inbox, Archive, Trash2, Settings, User, Pin, PinOff, Plus } from 'lucide-react';
import CategoryQuickAdd from './CategoryQuickAdd';

interface SidebarProps {
  categories: Category[];
  selectedView: 'inbox' | 'archive' | 'trash' | string;
  onViewChange: (view: 'inbox' | 'archive' | 'trash' | string) => void;
  onManageCategories: () => void;
  onQuickAddCategory?: (name: string, color: string) => Promise<void>;
  onNewNoteInCategory?: (categoryId: string) => void;
  inboxCount: number;
  pinnedNotes: Note[];
  selectedNoteId: string | null;
  onOpenPinnedNote: (note: Note) => void;
  onUnpinNote: (note: Note) => void;
  archiveCount: number;
  trashCount: number;
  style?: React.CSSProperties;
  connectionState?: string;
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
  onQuickAddCategory,
  onNewNoteInCategory,
  inboxCount,
  pinnedNotes,
  selectedNoteId,
  onOpenPinnedNote,
  onUnpinNote,
  archiveCount,
  trashCount,
  style,
  connectionState,
}: SidebarProps) {
  const navigate = useNavigate();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
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

  const [pinnedMenu, setPinnedMenu] = useState<{ visible: boolean; x: number; y: number; note: Note | null }>({
    visible: false,
    x: 0,
    y: 0,
    note: null,
  });

  useEffect(() => {
    const handleClick = () => setPinnedMenu((prev) => ({ ...prev, visible: false }));
    if (pinnedMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [pinnedMenu.visible]);

  const handlePinnedContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    setContextMenu((prev) => ({ ...prev, visible: false }));
    setPinnedMenu({ visible: true, x: e.clientX, y: e.clientY, note });
  };

  const handleCategoryContextMenu = (e: React.MouseEvent, category: Category) => {
    e.preventDefault();
    setPinnedMenu((prev) => ({ ...prev, visible: false }));
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
            <span className="sidebar-icon"><Inbox size={17} strokeWidth={1.75} /></span>
            <span className="sidebar-label">Inbox</span>
            {inboxCount > 0 && <span className="sidebar-count">{inboxCount}</span>}
          </button>

          <button
            className={`sidebar-item ${selectedView === 'archive' ? 'active' : ''}`}
            onClick={() => onViewChange('archive')}
          >
            <span className="sidebar-icon"><Archive size={17} strokeWidth={1.75} /></span>
            <span className="sidebar-label">Archive</span>
            {archiveCount > 0 && <span className="sidebar-count">{archiveCount}</span>}
          </button>

          <button
            className={`sidebar-item ${selectedView === 'trash' ? 'active' : ''}`}
            onClick={() => onViewChange('trash')}
          >
            <span className="sidebar-icon"><Trash2 size={17} strokeWidth={1.75} /></span>
            <span className="sidebar-label">Trash</span>
            {trashCount > 0 && <span className="sidebar-count">{trashCount}</span>}
          </button>
        </div>
        {pinnedNotes.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-header">Pinned</div>
            {pinnedNotes.map((note) => (
              <button
                key={note.id}
                className={`sidebar-item ${selectedNoteId === note.id ? 'active' : ''}`}
                onClick={() => onOpenPinnedNote(note)}
                onContextMenu={(e) => handlePinnedContextMenu(e, note)}
                title={getNoteCardText(note.content).title}
              >
                <span className="sidebar-icon"><Pin size={15} strokeWidth={1.75} /></span>
                <span className="sidebar-label sidebar-pinned-label">{getNoteCardText(note.content).title}</span>
              </button>
            ))}
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-section-header with-action">
            <span>Categories</span>
            {onQuickAddCategory && (
              <button
                type="button"
                className="sidebar-header-action"
                title="Add category"
                aria-label="Add category"
                onClick={() => setIsAddingCategory(true)}
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            )}
          </div>
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
          {isAddingCategory && onQuickAddCategory && (
            <CategoryQuickAdd
              color={nextCategoryColor(categories)}
              onCommit={async (name) => {
                await onQuickAddCategory(name, nextCategoryColor(categories));
                setIsAddingCategory(false);
              }}
              onCancel={() => setIsAddingCategory(false)}
            />
          )}
          <button className="sidebar-add-category" onClick={onManageCategories}>
            <span>+</span>
            <span>Manage Categories</span>
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={() => navigate('/app/settings')}>
          <span className="sidebar-icon"><Settings size={17} strokeWidth={1.75} /></span>
          <span className="sidebar-label">Settings</span>
        </button>
        <button className="sidebar-item" onClick={() => navigate('/app/account')}>
          <span className="sidebar-icon"><User size={17} strokeWidth={1.75} /></span>
          <span className="sidebar-label">Account</span>
        </button>
        {/* Sync status */}
        {(() => {
          let dotClass = 'connected';
          let label = 'synced';
          if (connectionState === 'disconnected') { dotClass = 'disconnected'; label = 'offline'; }
          else if (connectionState === 'connecting') { dotClass = 'connecting'; label = 'connecting'; }
          else if (connectionState === 'reconnecting') { dotClass = 'reconnecting'; label = 'reconnecting'; }
          return (
            <div className="sidebar-sync-status">
              <span className={`sidebar-sync-dot ${dotClass}`} />
              <span>{label}</span>
            </div>
          );
        })()}
      </div>

      {pinnedMenu.visible && pinnedMenu.note && (
        <div
          className="sidebar-context-menu"
          style={{ top: pinnedMenu.y, left: pinnedMenu.x }}
        >
          <button
            className="sidebar-context-menu-item"
            onClick={() => {
              const note = pinnedMenu.note;
              setPinnedMenu((prev) => ({ ...prev, visible: false }));
              if (note) onUnpinNote(note);
            }}
          >
            <span className="sidebar-context-menu-icon"><PinOff size={14} strokeWidth={1.75} /></span>
            <span>Unpin</span>
          </button>
        </div>
      )}

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
