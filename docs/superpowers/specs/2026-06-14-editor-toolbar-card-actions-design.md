# Card context menu + left-grouped editor toolbar

Date: 2026-06-14
Status: Approved (design)
Scope: Electron desktop **and** Web

## Problem

Two related editor/list ergonomics issues:

1. The note action buttons (fullscreen/focus, archive, trash) sit in the
   **upper-right** of the editor toolbar. On ultrawide monitors the editor pane
   is very wide, so those controls are stranded far from where the user is
   reading and working.
2. There is no way to act on a note from the list — deleting/archiving requires
   opening the note first and using the toolbar.

## Goals

- Right-click a card in the notes list to act on it directly.
- Reorganize the editor toolbar so all controls live on the left in logical
  groups, leaving only status on the right.

## Non-goals (YAGNI)

- Duplicate, Copy contents, Move-to-category, pin/favorite.
- Drag-and-drop in the list.
- Viewport edge-flip / smart repositioning of the menu (match the existing
  Sidebar menu's simple cursor placement).
- Multi-select / bulk actions.

## Feature 1 — Card right-click context menu

Mirror the existing `Sidebar` category context-menu pattern (a positioned
`<div>` that closes on outside click), applied to each `.notes-list-item`.

- **Trigger:** `onContextMenu` on the card → `preventDefault()`, record
  `{ visible, x, y, note }`, render the menu at the cursor.
- **Close on:** outside click (as Sidebar does), `Escape`, or after an item runs.
- **Items are context-aware by the current view:**
  | View | Items |
  |------|-------|
  | Inbox / category | Archive · Move to Trash |
  | Archive | Restore to Inbox · Move to Trash |
  | Trash | Restore to Inbox · Delete permanently *(confirm)* |
- **Selection:** right-clicking a card does not change which note is open.
  Acting on a card updates the list; if the acted card is the currently-open
  note, selection clears — same rule the toolbar already follows.

## Feature 2 — Toolbar reorganized: controls left, status right

In `NoteEditor`, move the action buttons out of `note-editor-toolbar-right`
into `note-editor-toolbar-left`, grouped with the existing
`note-editor-toolbar-divider`:

```
Edit Preview | (Focus) | (Category) (Code) | (Archive) (Trash)      ...saving   * synced
\------------------------------ all controls (left) ------------------------/   \- status -/
```

- `note-editor-toolbar-right` keeps only the non-interactive **Saving…** and
  **sync** indicators. (The "Saving…" indicator moves over from the left.)
- View-dependent behavior is unchanged: Archive shows only in Inbox; Restore in
  Archive/Trash; Delete permanently in Trash; Trash otherwise. Focus toggle
  always shows.
- **Icons:** replace the editor's emoji glyphs with **Lucide** icons
  (`Archive`, `Trash2`, `RotateCcw` for restore, `Maximize2`/`Minimize2` for
  focus) to match the Sidebar. Lucide is already a dependency on both platforms.

## Shared internals

- **Unify action handlers.** Today `Home`'s archive/restore/trash/delete act on
  the *selected* note via `selectedNoteRef`. Generalize them to take a target
  `note`, so the toolbar (selected note) and the context menu (right-clicked
  note) share one code path. The editor's existing `onArchive/onRestore/
  onTrash/onDelete` props become thin wrappers that pass the selected note.
- **Pure, testable menu logic.** A `getCardMenuActions(view)` helper returns the
  context-aware item descriptors `{ action, label, danger?, confirm? }` — same
  style as the `noteEditorLogic` helper. Both platforms import it (or each keeps
  a local copy following existing per-package conventions).
- **No new dependencies.**

## Files affected (both `packages/electron` and `packages/web`)

- `components/NotesList.tsx` — context-menu state, `onContextMenu`, menu render,
  new per-note action callbacks.
- `components/NoteEditor.tsx` — move action buttons to the left group; Lucide
  icons; "Saving…" to the right.
- `pages/Home.tsx` — generalize action handlers to take a note; pass new
  callbacks to `NotesList`.
- new `components/noteCardMenu.ts` (or similar) — `getCardMenuActions`.
- `index.css` — `notes-list-context-menu` styles (reuse Sidebar menu styling).

## Testing

- **Electron unit (jest):** `getCardMenuActions(view)` returns the right items
  per view (inbox/archive/trash/category).
- **Electron e2e (Playwright):** right-click a card → menu appears → "Move to
  Trash" → card leaves the inbox list and appears under Trash. Assert the
  toolbar action buttons render inside the left group.
- **Web:** mirror the components; verify via type-check/build and the shared
  unit logic. (Confirm web's test runner during planning; add equivalent unit
  coverage if present.)

## Risks / notes

- The list card is a `<button>`; nested context-menu handling must
  `preventDefault` to suppress the OS menu and `stopPropagation` so the card's
  own click doesn't fire.
- Delete-permanently keeps the existing `confirm()` dialog.
