export type CardMenuActionId = 'archive' | 'restore' | 'trash' | 'delete';

export interface CardMenuAction {
  id: CardMenuActionId;
  label: string;
  danger?: boolean;
  /** When set, callers must confirm() with this message before running. */
  confirm?: string;
}

/**
 * Context menu items for a note card, by the current view.
 * `view` is 'inbox' | 'archive' | 'trash' | a category id (treated like inbox).
 */
export function getCardMenuActions(view: string): CardMenuAction[] {
  if (view === 'archive') {
    return [
      { id: 'restore', label: 'Restore to Inbox' },
      { id: 'trash', label: 'Move to Trash' },
    ];
  }
  if (view === 'trash') {
    return [
      { id: 'restore', label: 'Restore to Inbox' },
      {
        id: 'delete',
        label: 'Delete permanently',
        danger: true,
        confirm: 'Are you sure you want to permanently delete this note?',
      },
    ];
  }
  return [
    { id: 'archive', label: 'Archive' },
    { id: 'trash', label: 'Move to Trash' },
  ];
}
