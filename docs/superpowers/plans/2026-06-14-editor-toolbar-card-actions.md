# Card Context Menu + Left-Grouped Editor Toolbar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu (archive/restore + trash/delete, context-aware by view) to note cards, and move all editor-toolbar controls to the left with status-only on the right — on both Electron and Web.

**Architecture:** A pure `getCardMenuActions(view)` helper in `@shared` drives the menu items. `NotesList` renders a positioned context menu mirroring the existing `Sidebar` pattern. `Home`'s archive/restore/trash/delete are unified into one `runNoteAction(action, note)` so the toolbar (selected note) and the menu (right-clicked note) share one path. The `NoteEditor` toolbar JSX is restructured so action buttons live in `note-editor-toolbar-left`.

**Tech Stack:** React 19 + TypeScript, lucide-react (already a dep on both), jest + ts-jest (electron unit), Playwright `_electron` (electron e2e), vite.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `packages/shared/src/noteCardMenu.ts` | Pure menu-item logic + types | Create |
| `packages/shared/src/index.ts` | Re-export the helper | Modify |
| `packages/electron/src/components/__tests__/noteCardMenu.test.ts` | Unit tests for the helper | Create |
| `packages/electron/src/pages/Home.tsx` | Unify action handlers; pass `onNoteAction`/`currentView` to list | Modify |
| `packages/electron/src/components/NotesList.tsx` | Context menu state + render + `onContextMenu` | Modify |
| `packages/electron/src/components/NoteEditor.tsx` | Toolbar reorg + Lucide icons | Modify |
| `packages/electron/src/index.css` | `notes-list-context-menu` styles | Modify |
| `packages/electron/e2e/card-actions.spec.ts` | e2e: right-click trash + toolbar layout | Create |
| `packages/web/src/pages/Home.tsx` | Same unify + pass props (api-based) | Modify |
| `packages/web/src/components/NotesList.tsx` | Same context menu | Modify |
| `packages/web/src/components/NoteEditor.tsx` | Toolbar reorg (already Lucide) | Modify |
| `packages/web/src/index.css` | `notes-list-context-menu` styles | Modify |

Tooling note (electron tests, from the prior fix): the repo's `jest.config.ts` needs `ts-node` (not installed locally). Run jest with the CommonJS config used previously:
`node ../../node_modules/jest/bin/jest.js --config /c/Users/jerem/flashpad-jest.config.cjs --rootDir .` from `packages/electron`. e2e needs the worktree's backend `bin` junctioned to the main checkout and a clean `vite build` (clear `node_modules/.vite`).

---

## Task 1: Shared `getCardMenuActions` helper (TDD)

**Files:**
- Create: `packages/shared/src/noteCardMenu.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/electron/src/components/__tests__/noteCardMenu.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/electron/src/components/__tests__/noteCardMenu.test.ts
import { getCardMenuActions } from '@shared/index';

describe('getCardMenuActions', () => {
  it('inbox view: archive + move to trash', () => {
    expect(getCardMenuActions('inbox').map((a) => a.id)).toEqual(['archive', 'trash']);
  });

  it('a category view behaves like inbox', () => {
    expect(getCardMenuActions('cat_abc123').map((a) => a.id)).toEqual(['archive', 'trash']);
  });

  it('archive view: restore + move to trash', () => {
    expect(getCardMenuActions('archive').map((a) => a.id)).toEqual(['restore', 'trash']);
  });

  it('trash view: restore + delete permanently (danger + confirm)', () => {
    const items = getCardMenuActions('trash');
    expect(items.map((a) => a.id)).toEqual(['restore', 'delete']);
    const del = items.find((a) => a.id === 'delete')!;
    expect(del.danger).toBe(true);
    expect(typeof del.confirm).toBe('string');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run (from `packages/electron`): `node ../../node_modules/jest/bin/jest.js --config /c/Users/jerem/flashpad-jest.config.cjs --rootDir . noteCardMenu`
Expected: FAIL — `Cannot find module` / `getCardMenuActions is not a function`.

- [ ] **Step 3: Implement the helper**

```ts
// packages/shared/src/noteCardMenu.ts
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
```

- [ ] **Step 4: Export it from the shared index**

In `packages/shared/src/index.ts`, add (next to the other `export * from './...'` lines):

```ts
export * from './noteCardMenu';
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `node ../../node_modules/jest/bin/jest.js --config /c/Users/jerem/flashpad-jest.config.cjs --rootDir . noteCardMenu`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/noteCardMenu.ts packages/shared/src/index.ts packages/electron/src/components/__tests__/noteCardMenu.test.ts
git commit -m "feat(shared): add getCardMenuActions helper for note card menu"
```

---

## Task 2: Electron — unify note action handlers

**Files:**
- Modify: `packages/electron/src/pages/Home.tsx` (replace handlers at ~597-655; update `<NotesList>` render at ~705-718)

- [ ] **Step 1: Add the import**

In `packages/electron/src/pages/Home.tsx`, change the `@shared/index` import to include the type:

```ts
import { Note, Category, NoteStatus, CreateCategoryDto, SignalRClient, SignalRManager, ConnectionState, DevicePresence, h4, CardMenuActionId } from '@shared/index';
```

- [ ] **Step 2: Replace the four handlers (`handleArchive`, `handleRestore`, `handleTrash`, `handleDelete`) with a unified action runner + thin wrappers**

Replace lines ~597-655 with:

```tsx
  const runNoteAction = useCallback(async (action: CardMenuActionId, note: Note) => {
    if (!syncManagerRef.current) return;
    if (action === 'delete' && !confirm('Are you sure you want to permanently delete this note?')) {
      return;
    }
    try {
      if (action === 'archive') {
        await syncManagerRef.current.archiveNote(note.id);
      } else if (action === 'restore') {
        await syncManagerRef.current.restoreNote(note.id);
      } else if (action === 'trash') {
        await syncManagerRef.current.trashNote(note.id);
      } else {
        await syncManagerRef.current.deleteNotePermanently(note.id);
      }
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setSelectedNote((prev) => (prev?.id === note.id ? null : prev));
      if (action !== 'delete') fetchCategories();
      const messages: Record<CardMenuActionId, string> = {
        archive: 'Note archived',
        restore: 'Note restored',
        trash: 'Note moved to trash',
        delete: 'Note deleted permanently',
      };
      toast.success(messages[action]);
    } catch (error) {
      console.error(`Failed to ${action} note:`, error);
      toast.error(`Failed to ${action} note`);
    }
  }, [fetchCategories, toast]);

  const handleArchive = useCallback(() => {
    const note = selectedNoteRef.current;
    if (note) runNoteAction('archive', note);
  }, [runNoteAction]);

  const handleRestore = useCallback(() => {
    const note = selectedNoteRef.current;
    if (note) runNoteAction('restore', note);
  }, [runNoteAction]);

  const handleTrash = useCallback(() => {
    const note = selectedNoteRef.current;
    if (note) runNoteAction('trash', note);
  }, [runNoteAction]);

  const handleDelete = useCallback(() => {
    const note = selectedNoteRef.current;
    if (note) runNoteAction('delete', note);
  }, [runNoteAction]);
```

- [ ] **Step 3: Pass the new props to `<NotesList>`**

In the `<NotesList ... />` JSX (~705-718), add two props after `pendingNoteIds={pendingNoteIds}`:

```tsx
            pendingNoteIds={pendingNoteIds}
            currentView={selectedView}
            onNoteAction={runNoteAction}
```

- [ ] **Step 4: Verify it type-checks**

Run (from `packages/electron`): `node ../../node_modules/typescript/lib/tsc.js --noEmit`
Expected: exit 0. (NotesList prop types come in Task 3; if tsc is run before Task 3 it will error on the two new props — run this check after Task 3, or temporarily expect that one error.)

- [ ] **Step 5: Commit** (defer commit to end of Task 3, since the props depend on it)

---

## Task 3: Electron — NotesList context menu

**Files:**
- Modify: `packages/electron/src/components/NotesList.tsx`

- [ ] **Step 1: Update imports + props interface**

Replace the top imports:

```tsx
import { useState, useEffect, memo } from 'react';
import { Note } from '@shared/types';
import { getCardMenuActions, CardMenuActionId } from '@shared/index';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';

const ACTION_ICONS: Record<CardMenuActionId, typeof Archive> = {
  archive: Archive,
  restore: RotateCcw,
  trash: Trash2,
  delete: Trash2,
};

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  note: Note | null;
}
```

Add to `NotesListProps`:

```tsx
  currentView?: string;
  onNoteAction?: (action: CardMenuActionId, note: Note) => void;
```

And add them to the destructured params and (since this component is `memo`'d, no extra work needed).

- [ ] **Step 2: Add context-menu state + close-on-click/Escape + handler**

Inside `NotesListInner`, before the `return (`:

```tsx
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    note: null,
  });

  useEffect(() => {
    if (!contextMenu.visible) return;
    const close = () => setContextMenu((prev) => ({ ...prev, visible: false }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu.visible]);

  const handleCardContextMenu = (e: React.MouseEvent, note: Note) => {
    if (!onNoteAction) return;
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, note });
  };
```

- [ ] **Step 3: Wire `onContextMenu` on the card button**

On the `<button className={`notes-list-item ...`} ...>` add:

```tsx
              onContextMenu={(e) => handleCardContextMenu(e, note)}
```

- [ ] **Step 4: Render the menu**

Just before the closing `</div>` of `.notes-list` (after the items block), add:

```tsx
      {contextMenu.visible && contextMenu.note && (
        <div
          className="notes-list-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {getCardMenuActions(currentView ?? 'inbox').map((action) => {
            const Icon = ACTION_ICONS[action.id];
            return (
              <button
                key={action.id}
                className={`notes-list-context-menu-item${action.danger ? ' danger' : ''}`}
                onClick={() => {
                  const note = contextMenu.note;
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                  if (note) onNoteAction?.(action.id, note);
                }}
              >
                <span className="notes-list-context-menu-icon">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
```

- [ ] **Step 5: Type-check both files**

Run (from `packages/electron`): `node ../../node_modules/typescript/lib/tsc.js --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit Tasks 2+3**

```bash
git add packages/electron/src/pages/Home.tsx packages/electron/src/components/NotesList.tsx
git commit -m "feat(electron): right-click context menu on note cards (archive/trash)"
```

---

## Task 4: Electron — context menu styles

**Files:**
- Modify: `packages/electron/src/index.css` (add after the `.sidebar-context-menu-icon` block ~line 1549)

- [ ] **Step 1: Add the styles** (cloned from `.sidebar-context-menu`, plus a `.danger` variant)

```css
/* Notes List Context Menu */
.notes-list-context-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--rule-2);
  border-radius: var(--radius);
  padding: 4px;
  min-width: 180px;
  z-index: 1000;
  box-shadow: var(--shadow);
}

.notes-list-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: var(--radius);
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.notes-list-context-menu-item:hover {
  background: var(--bg-3);
}

.notes-list-context-menu-item.danger {
  color: #e5484d;
}

.notes-list-context-menu-icon {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: var(--ink-2);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style(electron): notes list context menu"
```

---

## Task 5: Electron — toolbar reorg + Lucide icons

**Files:**
- Modify: `packages/electron/src/components/NoteEditor.tsx`

- [ ] **Step 1: Add Lucide import** (after the existing imports near the top)

```tsx
import { Code, Maximize2, X, Archive, Inbox, RotateCcw, Trash2 } from 'lucide-react';
```

- [ ] **Step 2: Replace the toolbar block (lines ~372-503, the whole `<div className="note-editor-toolbar"> ... </div>`)**

```tsx
      <div className="note-editor-toolbar">
        <div className="note-editor-toolbar-left">
          {/* Edit/Preview tabs */}
          <button
            className={`note-editor-tab ${!previewMode ? 'active' : ''}`}
            onClick={() => setPreviewMode(false)}
          >Edit</button>
          <button
            className={`note-editor-tab ${previewMode ? 'active' : ''}`}
            onClick={() => setPreviewMode(true)}
          >Preview</button>
          <span className="note-editor-toolbar-divider" />

          {/* Focus / fullscreen */}
          {onToggleFocusMode && (
            <button
              className="note-editor-action-btn focus-mode-toolbar-btn"
              onClick={onToggleFocusMode}
              title={isFocusMode ? 'Exit Focus Mode (Ctrl+Shift+F)' : 'Focus Mode (Ctrl+Shift+F)'}
            >
              {isFocusMode ? <X size={15} strokeWidth={1.75} /> : <Maximize2 size={15} strokeWidth={1.75} />}
            </button>
          )}
          <span className="note-editor-toolbar-divider" />

          {/* Category selector */}
          <div className="note-editor-category-selector">
            <button
              className="note-editor-category-btn"
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            >
              {selectedCategory ? (
                <>
                  <span
                    className="note-editor-category-dot"
                    style={{ backgroundColor: selectedCategory.color }}
                  />
                  {selectedCategory.name}
                </>
              ) : (
                'Inbox'
              )}
              <span className="note-editor-category-arrow">&#9662;</span>
            </button>
            {showCategoryDropdown && (
              <div className="note-editor-category-dropdown">
                <button
                  className={`note-editor-category-option ${!selectedCategoryId ? 'selected' : ''}`}
                  onClick={() => handleCategoryChange(undefined)}
                >
                  Inbox
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`note-editor-category-option ${selectedCategoryId === category.id ? 'selected' : ''}`}
                    onClick={() => handleCategoryChange(category.id)}
                  >
                    <span
                      className="note-editor-category-dot"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Code block button */}
          <div className="note-editor-code-block-selector">
            <button
              className="note-editor-action-btn"
              onClick={() => setShowCodeLangDropdown(!showCodeLangDropdown)}
              title="Insert Code Block (Ctrl+Shift+K)"
            >
              <Code size={15} strokeWidth={1.75} />
            </button>
            {showCodeLangDropdown && (
              <div className="note-editor-code-lang-dropdown">
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang || '_plain'}
                    className="note-editor-code-lang-option"
                    onClick={() => handleCodeBlockInsert(lang)}
                  >
                    {lang || 'Plain text'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="note-editor-toolbar-divider" />

          {/* Note actions */}
          {note?.status === NoteStatus.Inbox && (
            <button className="note-editor-action-btn" onClick={onArchive} title="Archive">
              <Archive size={15} strokeWidth={1.75} />
            </button>
          )}
          {note?.status === NoteStatus.Archived && (
            <button className="note-editor-action-btn" onClick={onRestore} title="Move to Inbox">
              <Inbox size={15} strokeWidth={1.75} />
            </button>
          )}
          {note?.status === NoteStatus.Trash ? (
            <>
              <button className="note-editor-action-btn" onClick={onRestore} title="Restore">
                <RotateCcw size={15} strokeWidth={1.75} />
              </button>
              <button className="note-editor-action-btn danger" onClick={onDelete} title="Delete Permanently">
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <button className="note-editor-action-btn" onClick={onTrash} title="Move to Trash">
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="note-editor-toolbar-right">
          {showSavingIndicator && <span className="note-editor-saving">Saving...</span>}
          {/* Sync indicator */}
          {(() => {
            const sync = getSyncInfo();
            return (
              <span className="note-editor-sync-indicator">
                <span className={`note-editor-sync-dot ${sync.dotClass}`} />
                {sync.label}
              </span>
            );
          })()}
        </div>
      </div>
```

- [ ] **Step 3: Type-check**

Run (from `packages/electron`): `node ../../node_modules/typescript/lib/tsc.js --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/components/NoteEditor.tsx
git commit -m "feat(electron): left-group editor toolbar controls, Lucide icons"
```

---

## Task 6: Electron — e2e (Playwright)

**Files:**
- Create: `packages/electron/e2e/card-actions.spec.ts`

Prereqs (one-time in worktree): junction backend bin — `New-Item -ItemType Junction -Path "<wt>\packages\backend\bin" -Target "C:\Data\Repos\Flashpad\packages\backend\bin"`; clean rebuild — from `packages/electron`: `rm -rf dist dist-electron node_modules/.vite && node ../../node_modules/vite/bin/vite.js build`.

- [ ] **Step 1: Write the e2e test**

```ts
// packages/electron/e2e/card-actions.spec.ts
import { test, expect } from '@playwright/test';
import { getE2EState, E2EState } from './helpers/e2e-state';
import { createNoteViaApi } from './helpers/auth';
import { launchApp, loginViaUi, listNoteFiles, readNoteFile, AppInstance } from './helpers/electron-app';

let state: E2EState;
test.beforeAll(async () => { state = getE2EState(); });

test.describe('Note card context menu + toolbar layout', () => {
  let app: AppInstance;
  test.afterEach(async () => { await app?.stop(); });

  test('right-click a card -> Move to Trash removes it from the inbox list', async () => {
    const content = `Card menu test ${Date.now()}`;
    await createNoteViaApi(state.baseUrl, state.token, content);

    app = await launchApp({ apiUrl: state.baseUrl, deviceId: 'device-card-menu' });
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(5000); // initial sync

    const card = app.page.locator('.notes-list-item', { hasText: 'Card menu test' }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click({ button: 'right' });

    const trashItem = app.page.locator('.notes-list-context-menu-item', { hasText: 'Move to Trash' });
    await expect(trashItem).toBeVisible();
    await trashItem.click();

    await expect(
      app.page.locator('.notes-list-item', { hasText: 'Card menu test' })
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('editor action buttons render inside the left toolbar group', async () => {
    const content = `Toolbar layout test ${Date.now()}`;
    await createNoteViaApi(state.baseUrl, state.token, content);

    app = await launchApp({ apiUrl: state.baseUrl, deviceId: 'device-toolbar' });
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(5000);

    await app.page.locator('.notes-list-item', { hasText: 'Toolbar layout test' }).first().click();

    // Trash button (title="Move to Trash") must live in the left group, not the right.
    const leftTrash = app.page.locator('.note-editor-toolbar-left button[title="Move to Trash"]');
    await expect(leftTrash).toBeVisible();
    const rightActions = app.page.locator('.note-editor-toolbar-right button');
    await expect(rightActions).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the e2e**

Run (from `packages/electron`): `node ../../node_modules/@playwright/test/cli.js test --config playwright.config.ts card-actions`
Expected: 2 passed (after the clean rebuild so the bundle has the changes).

- [ ] **Step 3: Commit**

```bash
git add packages/electron/e2e/card-actions.spec.ts
git commit -m "test(electron): e2e for card context menu and toolbar layout"
```

---

## Task 7: Web — NotesList context menu + unified handlers

**Files:**
- Modify: `packages/web/src/pages/Home.tsx` (handlers ~389-439; `<NotesList>` render ~480-491)
- Modify: `packages/web/src/components/NotesList.tsx`

- [ ] **Step 1: Web Home — unify handlers**

Add import of `CardMenuActionId` to the web Home `@shared` import. Replace `handleArchive/handleRestore/handleTrash/handleDelete` (lines ~389-439) with:

```tsx
  const runNoteAction = async (action: CardMenuActionId, note: Note) => {
    if (action === 'delete' && !confirm('Are you sure you want to permanently delete this note?')) {
      return;
    }
    try {
      const deviceId = getOrCreateWebDeviceId();
      if (action === 'archive') {
        await api.archiveNote(note.id, deviceId);
      } else if (action === 'restore') {
        await api.restoreNote(note.id, deviceId);
      } else if (action === 'trash') {
        await api.trashNote(note.id, deviceId);
      } else {
        await api.deleteNotePermanently(note.id, deviceId);
      }
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      setSelectedNote((prev) => (prev?.id === note.id ? null : prev));
      setConflictMessage(null);
      if (action !== 'delete') fetchCategories();
    } catch (error) {
      console.error(`Failed to ${action} note:`, error);
    }
  };

  const handleArchive = () => { if (selectedNote) runNoteAction('archive', selectedNote); };
  const handleRestore = () => { if (selectedNote) runNoteAction('restore', selectedNote); };
  const handleTrash = () => { if (selectedNote) runNoteAction('trash', selectedNote); };
  const handleDelete = () => { if (selectedNote) runNoteAction('delete', selectedNote); };
```

- [ ] **Step 2: Web Home — pass props to `<NotesList>`** (after `showCategory={...}`):

```tsx
            showCategory={selectedView === 'inbox' || selectedView === 'archive' || selectedView === 'trash'}
            currentView={selectedView}
            onNoteAction={runNoteAction}
```

- [ ] **Step 3: Web NotesList — same context menu as electron**

Apply the same edits as Task 3 to `packages/web/src/components/NotesList.tsx`: imports (`useState`, `useEffect`, `getCardMenuActions`, `CardMenuActionId`, lucide `Archive, RotateCcw, Trash2`, `ACTION_ICONS`, `ContextMenuState`), the two new props (`currentView?`, `onNoteAction?`), the `contextMenu` state + close effect + `handleCardContextMenu`, the `onContextMenu` on the card button, and the menu render block. (Web NotesList has no `pendingNoteIds`; otherwise identical structure.)

- [ ] **Step 4: Type-check web**

Run (from `packages/web`): `node ../../node_modules/typescript/lib/tsc.js --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/Home.tsx packages/web/src/components/NotesList.tsx
git commit -m "feat(web): right-click context menu on note cards (archive/trash)"
```

---

## Task 8: Web — toolbar reorg (already Lucide)

**Files:**
- Modify: `packages/web/src/components/NoteEditor.tsx` (toolbar block ~345-465)
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Reorder the toolbar** — move the focus/archive/restore/trash buttons from `note-editor-toolbar-right` into `note-editor-toolbar-left` (after the code-block selector, preceded by a `<span className="note-editor-toolbar-divider" />`), and add a divider after the Edit/Preview tabs followed by the focus button. Move `{showSavingIndicator && ...}` into `note-editor-toolbar-right` ahead of the sync indicator. Keep the existing Lucide icons (`X`/`Maximize2`, `Archive`, `Inbox`, `RotateCcw`, `Trash2`) and the `note?.status` conditionals exactly as they are today — only their container changes. Resulting structure mirrors Task 5 (web keeps its disabled Preview tab and `getSyncLabel()` call).

- [ ] **Step 2: Web CSS** — add the same `.notes-list-context-menu*` block from Task 4 to `packages/web/src/index.css`.

- [ ] **Step 3: Type-check + build web**

Run (from `packages/web`): `node ../../node_modules/typescript/lib/tsc.js --noEmit` (exit 0), then `node ../../node_modules/vite/bin/vite.js build` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/NoteEditor.tsx packages/web/src/index.css
git commit -m "feat(web): left-group editor toolbar controls + card menu styles"
```

---

## Task 9: Final verification

- [ ] **Step 1: Electron unit + type-check**

From `packages/electron`: jest (full) via the CJS config → all pass; `tsc --noEmit` → exit 0.

- [ ] **Step 2: Electron e2e (full suite)** — clean `vite build` then run the whole Playwright suite; new `card-actions` tests pass and the previously-passing tests stay green.

- [ ] **Step 3: Manual smoke (both apps)** — right-click a card in inbox/archive/trash and confirm the correct items; run an Archive and a Move-to-Trash; confirm the editor toolbar shows all controls on the left with only Saving…/sync on the right.

- [ ] **Step 4:** Stop; report results for human verification before merge.
