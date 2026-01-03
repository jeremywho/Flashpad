# Flashpad - Project Plan

> A cross-platform quick note capture app for Windows, Mac, iOS, and Android

## Vision

Flashpad is a lightweight, fast note-capture application designed to quickly capture thoughts, ideas, and notes across all devices. The core philosophy is **capture first, organize later** - removing friction from the note-taking process.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLASHPAD ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Desktop App    │    │   Mobile App    │    │   Mobile App    │         │
│  │   (Electron)    │    │     (iOS)       │    │   (Android)     │         │
│  │                 │    │                 │    │                 │         │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │         │
│  │ │ Quick Popup │ │    │ │   Widget    │ │    │ │ Quick Tile  │ │         │
│  │ │ (Hotkey)    │ │    │ │ (Home/Lock) │ │    │ │ (Settings)  │ │         │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │         │
│  │ ┌─────────────┐ │    │                 │    │                 │         │
│  │ │ Main Window │ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │         │
│  │ │ (Inbox/Mgmt)│ │    │ │  Full App   │ │    │ │  Full App   │ │         │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │         │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │         │
│  │ │System Tray  │ │    │ │Local SQLite │ │    │ │Local SQLite │ │         │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │         │
│  │ ┌─────────────┐ │    │                 │    │                 │         │
│  │ │Local SQLite │ │    │                 │    │                 │         │
│  │ └─────────────┘ │    │                 │    │                 │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           └──────────────────────┼──────────────────────┘                   │
│                                  │                                          │
│                         ┌────────▼────────┐                                 │
│                         │   WebSocket     │                                 │
│                         │   Connection    │                                 │
│                         │   (SignalR)     │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│  ┌───────────────────────────────┼───────────────────────────────────────┐  │
│  │                         BACKEND (.NET 9)                              │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │  │
│  │  │  REST API   │    │  SignalR    │    │   Auth      │               │  │
│  │  │  (CRUD)     │    │  Hub        │    │   (JWT)     │               │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘               │  │
│  │                           │                                           │  │
│  │                    ┌──────▼──────┐                                    │  │
│  │                    │   SQLite    │                                    │  │
│  │                    │  (Primary)  │                                    │  │
│  │                    └─────────────┘                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Core Entities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA MODEL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User                        Note                        Category           │
│  ┌──────────────────┐       ┌───────────────────────┐   ┌───────────────┐  │
│  │ Id (GUID)        │       │ Id (GUID)             │   │ Id (GUID)     │  │
│  │ Email            │◄──────│ UserId                │   │ UserId        │  │
│  │ PasswordHash     │       │ Content (text)        │──►│ Name          │  │
│  │ FullName         │       │ CategoryId? (GUID)    │   │ Color         │  │
│  │ CreatedAt        │       │ Status (enum)         │   │ Icon          │  │
│  │ UpdatedAt        │       │ Version (int)         │   │ SortOrder     │  │
│  └──────────────────┘       │ CreatedAt             │   │ CreatedAt     │  │
│                             │ UpdatedAt             │   │ UpdatedAt     │  │
│                             │ DeviceId              │   └───────────────┘  │
│                             │ IsDeleted             │                      │
│                             │ DeletedAt?            │   NoteHistory        │
│                             └───────────────────────┘   ┌───────────────┐  │
│                                       │                 │ Id (GUID)     │  │
│  NoteStatus (enum):                   └────────────────►│ NoteId        │  │
│  - Inbox                                                │ Content       │  │
│  - Archived                                             │ Version       │  │
│  - Trash                                                │ CreatedAt     │  │
│                                                         │ DeviceId      │  │
│                                                         └───────────────┘  │
│                                                                             │
│  SyncQueue (Local Only)              Conflict (Phase 2)                    │
│  ┌──────────────────────┐           ┌───────────────────────┐              │
│  │ Id                   │           │ Id (GUID)             │              │
│  │ NoteId               │           │ NoteId                │              │
│  │ Operation (enum)     │           │ LocalContent          │              │
│  │ Payload (JSON)       │           │ ServerContent         │              │
│  │ BaseVersion          │           │ LocalVersion          │              │
│  │ CreatedAt            │           │ ServerVersion         │              │
│  │ RetryCount           │           │ Status (enum)         │              │
│  │ Status               │           │ CreatedAt             │              │
│  └──────────────────────┘           │ ResolvedAt?           │              │
│                                     └───────────────────────┘              │
│  Operation: Create, Update, Delete, Move, Archive                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (MVP)

### Goal
Basic note capture and sync across all platforms with offline support.

### 1.1 Project Setup
- [x] Clone StarterTemplates to Flashpad
- [x] Update all branding (package names, app IDs, bundle identifiers)
- [x] Generate new JWT secret
- [x] Set up development environment
- [x] Configure GitHub repo and CI/CD

### 1.2 Backend - Core API
- [x] Create Note model and migrations
- [x] Create Category model and migrations
- [x] Create NoteHistory model for revision tracking
- [x] Implement REST endpoints:
  - `POST /api/notes` - Create note
  - `GET /api/notes` - List notes (with filters: status, category, search)
  - `GET /api/notes/{id}` - Get single note
  - `PUT /api/notes/{id}` - Update note (with version check)
  - `DELETE /api/notes/{id}` - Soft delete (move to trash)
  - `POST /api/notes/{id}/archive` - Archive note
  - `POST /api/notes/{id}/restore` - Restore from trash/archive
  - `DELETE /api/notes/{id}/permanent` - Permanent delete
  - `POST /api/notes/empty-trash` - Empty trash
- [x] Implement Category endpoints:
  - `POST /api/categories` - Create category
  - `GET /api/categories` - List categories
  - `PUT /api/categories/{id}` - Update category
  - `DELETE /api/categories/{id}` - Delete category
- [x] Add version tracking and history recording on updates
- [x] Add pagination support for note listing

### 1.3 Backend - Real-time Sync (SignalR)
- [x] Add SignalR NuGet package
- [x] Create NotesHub for real-time communication
- [x] Implement hub methods:
  - `JoinUserGroup` - Subscribe to user's notes
  - `NoteCreated` - Broadcast new note
  - `NoteUpdated` - Broadcast note update
  - `NoteDeleted` - Broadcast note deletion
  - `NoteStatusChanged` - Broadcast archive/restore
- [x] Add JWT authentication for SignalR hub
- [x] Handle connection/disconnection events
- [ ] Implement presence tracking (which devices are online)

### 1.4 Shared Package Updates
- [x] Add Note, Category, NoteHistory types
- [x] Add NoteStatus enum
- [x] Add API client methods for notes and categories
- [x] Add SignalR client helper/types
- [x] Add sync-related types (SyncQueue, SyncOperation)

### 1.5 Desktop (Electron) - Quick Capture
- [x] Implement global hotkey registration (Ctrl+Shift+N or configurable)
- [x] Create QuickCapture popup window:
  - Small, floating window (300x200 or similar)
  - Auto-focus textarea
  - Submit on Ctrl+Enter or button
  - Cancel on Escape
  - Optional: category quick-select
- [x] Window behavior:
  - Appears at cursor position or center screen
  - Always on top
  - No taskbar entry
  - Disappears after submit
- [x] Add hotkey configuration to Settings page
- [x] Update system tray menu:
  - "Quick Note" - opens popup
  - "Open Flashpad" - opens main window
  - "Quit"

### 1.6 Desktop (Electron) - Main Window
- [x] Create Inbox view:
  - Note list with preview
  - Quick actions (archive, delete, categorize)
  - Click to edit
- [x] Create Note editor:
  - Full-width textarea
  - Save button / auto-save
  - Category selector
  - Created/updated timestamps
  - Version indicator
- [x] Create sidebar navigation:
  - Inbox (with count)
  - Categories (collapsible list)
  - Archive
  - Trash (with count)
- [x] Create Category management:
  - Add/edit/delete categories
  - Color picker
  - Icon selector
- [x] Create Archive view (same as inbox, filtered)
- [x] Create Trash view:
  - Note list
  - Restore / permanent delete actions
  - "Empty Trash" button
- [ ] Create Search functionality:
  - Search input in header
  - Search across all notes
  - Filter by status/category

### 1.7 Desktop (Electron) - Local Storage & Sync
- [x] Set up local SQLite database (better-sqlite3 or sql.js)
- [x] Create local database schema mirroring server
- [x] Implement offline queue (SyncQueue table)
- [x] Create sync manager:
  - Queue operations when offline
  - Process queue when online
  - Handle conflicts (Phase 1: last-write-wins with history)
- [x] Implement SignalR client connection:
  - Auto-reconnect on disconnect
  - Join user group on auth
  - Handle incoming updates
- [x] Add connection status indicator (online/offline/syncing)

### 1.8 Desktop (Electron) - Theming
- [x] Implement CSS variables for theming
- [x] Create dark theme (default)
- [x] Create light theme
- [x] Add theme toggle in Settings
- [x] Persist theme preference
- [x] Support system preference detection

### 1.9 Mobile (React Native) - Core App
- [x] Create Inbox screen with note list
- [x] Create Note editor screen
- [x] Create Sidebar/drawer navigation:
  - Inbox, Categories, Archive, Trash
- [ ] Create Category management screen
- [ ] Create Search functionality
- [x] Implement dark/light theme
- [ ] Add theme toggle in Settings

### 1.10 Mobile (React Native) - Local Storage & Sync
- [x] Set up local SQLite (expo-sqlite or react-native-sqlite-storage)
- [x] Create local database schema
- [x] Implement offline queue
- [x] Create sync manager (same logic as desktop)
- [x] Implement SignalR client connection
- [x] Add connection status indicator

### 1.11 Mobile (React Native) - Quick Capture
- [x] **iOS Widget** (Home/Lock screen):
  - Simple text input widget
  - "Add Note" button widget that opens app to quick capture
  - Requires WidgetKit / React Native Widget extension
- [x] **Android Quick Settings Tile**:
  - Tile in notification shade
  - Opens app to quick capture screen
  - Requires TileService / React Native Module
- [ ] **Android Notification Action**:
  - Persistent notification with "Add Note" action
  - Optional based on user preference
- [x] Create QuickCapture screen:
  - Minimal UI - just textarea and save button
  - Deep link support for widgets

### 1.12 Testing & Polish
- [ ] Add unit tests for backend services
- [ ] Add integration tests for API endpoints
- [ ] Add E2E tests for critical flows (Electron)
- [ ] Add component tests (React Native)
- [ ] Performance optimization
- [ ] Accessibility review
- [ ] Error handling and user feedback

---

## Phase 2: Conflict Resolution & Enhanced Sync

### Goal
Add conflict detection and resolution UI for safer offline editing.

### 2.1 Backend Changes
- [ ] Modify update endpoint for version-aware writes:
  - Accept `baseVersion` in request
  - Compare with current version
  - If mismatch: create conflict record, don't overwrite
  - Return conflict info in response
- [ ] Add Conflict model and migrations
- [ ] Add conflict endpoints:
  - `GET /api/notes/{id}/conflicts` - Get conflicts for a note
  - `POST /api/notes/{id}/conflicts/{conflictId}/resolve` - Resolve conflict
- [ ] Add SignalR events for conflicts:
  - `ConflictDetected` - Notify client of new conflict

### 2.2 Desktop - Conflict UI
- [ ] Add conflict indicator on notes
- [ ] Create conflict resolution modal:
  - Side-by-side view of local vs server content
  - Diff highlighting
  - "Keep Mine" / "Keep Server" / "Merge" options
  - Manual edit capability
- [ ] Add conflict notification/badge in UI

### 2.3 Mobile - Conflict UI
- [ ] Add conflict indicator on notes
- [ ] Create conflict resolution screen
- [ ] Add conflict notification

### 2.4 Sync Manager Updates
- [ ] Update sync logic for conflict detection
- [ ] Handle conflict response from server
- [ ] Store conflicts locally
- [ ] Surface conflicts to UI

---

## Phase 3: Push Notifications (Future)

### Goal
Enable push notifications for real-time updates when apps are backgrounded/closed.

### 3.1 Backend
- [ ] Add push notification service (Azure Notification Hubs, Firebase, or OneSignal)
- [ ] Store device tokens per user
- [ ] Device registration endpoints
- [ ] Trigger push on note events (create/update from other devices)

### 3.2 Mobile
- [ ] Implement push notification handling (Firebase Cloud Messaging)
- [ ] Register device token on login
- [ ] Handle notification tap (deep link to note)
- [ ] Background sync on notification

### 3.3 Desktop
- [ ] Implement native notifications
- [ ] Optional: Web push for browser-based access

---

## Phase 4: Rich Text & Markdown (Future)

### Goal
Support formatted text input.

### 4.1 Features
- [ ] Markdown editor with preview
- [ ] Rich text formatting toolbar
- [ ] Code block support with syntax highlighting
- [ ] Image attachments (requires storage solution)
- [ ] Checklist support
- [ ] Link handling

---

## Phase 5: Advanced Features (Future Roadmap)

### 5.1 Collaboration
- [ ] Shared notes between users
- [ ] Real-time collaborative editing (CRDT-based)
- [ ] Comments on notes

### 5.2 Organization
- [ ] Tags (multiple per note)
- [ ] Nested categories
- [ ] Smart filters / saved searches
- [ ] Pinned notes

### 5.3 Integration
- [ ] Share extension (iOS/Android)
- [ ] Browser extension for web clipping
- [ ] API for third-party integrations
- [ ] Zapier/IFTTT integration

### 5.4 Productivity
- [ ] Reminders on notes
- [ ] Daily digest
- [ ] Export (JSON, Markdown, PDF)
- [ ] Import from other note apps

---

## Technical Decisions

### Database Strategy

**Server**: SQLite
- Simple deployment (single file database)
- Template already configured for SQLite
- Sufficient for initial scale
- Can migrate to PostgreSQL later if needed

**Local (Desktop/Mobile)**: SQLite
- Fast, embedded database
- Works offline
- Small footprint
- Synchronization friendly

### Sync Strategy (Phase 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SYNC FLOW (PHASE 1)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CREATE NOTE (Offline)                                                   │
│  ┌─────────────┐                                                            │
│  │   Client    │  → Save to local DB with tempId                           │
│  │             │  → Add to SyncQueue (operation: CREATE)                   │
│  │             │  → When online: POST /api/notes                           │
│  │             │  → Server returns real ID                                 │
│  │             │  → Update local record with real ID                       │
│  │             │  → Remove from SyncQueue                                  │
│  │             │  → SignalR broadcasts to other devices                    │
│  └─────────────┘                                                            │
│                                                                             │
│  2. UPDATE NOTE (Offline)                                                   │
│  ┌─────────────┐                                                            │
│  │   Client    │  → Save to local DB                                       │
│  │             │  → Add to SyncQueue (operation: UPDATE, baseVersion: X)   │
│  │             │  → When online: PUT /api/notes/{id}                       │
│  │             │  → Server accepts (last-write-wins)                       │
│  │             │  → Server saves old version to NoteHistory                │
│  │             │  → Server increments version                              │
│  │             │  → Update local version                                   │
│  │             │  → Remove from SyncQueue                                  │
│  └─────────────┘                                                            │
│                                                                             │
│  3. REAL-TIME SYNC (Online)                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │  Device A   │───►│   Server    │───►│  Device B   │                     │
│  │  (editing)  │    │  (SignalR)  │    │  (receives) │                     │
│  │             │    │             │    │             │                     │
│  │ User types  │    │ Broadcasts  │    │ Updates     │                     │
│  │ → Save      │    │ NoteUpdated │    │ local DB    │                     │
│  │ → API call  │    │ to group    │    │ & UI        │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sync Strategy (Phase 2 - Conflict Detection)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SYNC FLOW (PHASE 2)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  UPDATE WITH CONFLICT DETECTION                                             │
│                                                                             │
│  ┌─────────────┐                    ┌─────────────┐                         │
│  │   Client    │                    │   Server    │                         │
│  │             │  PUT /api/notes/1  │             │                         │
│  │ baseVersion │ ─────────────────► │ version = 5 │                         │
│  │     = 3     │    body: {...}     │             │                         │
│  │             │                    │             │                         │
│  │             │                    │ baseVersion │                         │
│  │             │                    │ (3) < version │                       │
│  │             │                    │ (5)          │                         │
│  │             │                    │             │                         │
│  │             │   409 Conflict     │ → Create    │                         │
│  │             │ ◄───────────────── │   Conflict  │                         │
│  │             │  {conflictId,      │   record    │                         │
│  │             │   serverContent,   │             │                         │
│  │             │   serverVersion}   │             │                         │
│  │             │                    │             │                         │
│  │ → Show      │                    │             │                         │
│  │   conflict  │                    │             │                         │
│  │   UI        │                    │             │                         │
│  │             │                    │             │                         │
│  │ → User      │  POST /resolve     │             │                         │
│  │   picks one │ ─────────────────► │ → Apply     │                         │
│  │   or merges │    resolution      │   resolution│                         │
│  │             │                    │ → Increment │                         │
│  │             │   200 OK           │   version   │                         │
│  │             │ ◄───────────────── │             │                         │
│  └─────────────┘                    └─────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI/UX Design Principles

1. **Speed First**: < 500ms to capture a note from hotkey
2. **Minimal Friction**: One-step capture, organize later
3. **Always Available**: Works offline, syncs when connected
4. **Dark by Default**: Easy on eyes, modern aesthetic
5. **Consistent Cross-Platform**: Same mental model on all devices
6. **Visual Feedback**: Clear sync status, connection indicators

### Color Palette (Dark Theme)

```
Background:        #0D0D0D (near black)
Surface:           #1A1A1A (cards, panels)
Surface Elevated:  #262626 (modals, dropdowns)
Border:            #333333
Text Primary:      #FFFFFF
Text Secondary:    #999999
Text Muted:        #666666
Accent Primary:    #6366F1 (indigo)
Accent Secondary:  #818CF8 (lighter indigo)
Success:           #22C55E
Warning:           #F59E0B
Error:             #EF4444
```

### Color Palette (Light Theme)

```
Background:        #FFFFFF
Surface:           #F5F5F5
Surface Elevated:  #FFFFFF
Border:            #E5E5E5
Text Primary:      #0D0D0D
Text Secondary:    #666666
Text Muted:        #999999
Accent Primary:    #4F46E5 (indigo)
Accent Secondary:  #6366F1
Success:           #16A34A
Warning:           #D97706
Error:             #DC2626
```

---

## File Structure (After Setup)

```
Flashpad/
├── packages/
│   ├── backend/
│   │   ├── Controllers/
│   │   │   ├── AuthController.cs
│   │   │   ├── NotesController.cs
│   │   │   ├── CategoriesController.cs
│   │   │   └── UsersController.cs
│   │   ├── Hubs/
│   │   │   └── NotesHub.cs
│   │   ├── Models/
│   │   │   ├── User.cs
│   │   │   ├── Note.cs
│   │   │   ├── Category.cs
│   │   │   ├── NoteHistory.cs
│   │   │   └── Conflict.cs (Phase 2)
│   │   ├── Services/
│   │   │   ├── NoteService.cs
│   │   │   ├── SyncService.cs
│   │   │   └── NotificationService.cs (Phase 3)
│   │   └── Data/
│   │       └── AppDbContext.cs
│   │
│   ├── electron/
│   │   ├── electron/
│   │   │   ├── main.ts
│   │   │   ├── quickCapture.ts    # Quick capture window logic
│   │   │   ├── globalShortcuts.ts # Hotkey registration
│   │   │   └── tray.ts
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── NoteList/
│   │   │   │   ├── NoteEditor/
│   │   │   │   ├── QuickCapture/
│   │   │   │   ├── Sidebar/
│   │   │   │   ├── CategoryManager/
│   │   │   │   └── ConflictResolver/ (Phase 2)
│   │   │   ├── pages/
│   │   │   │   ├── Inbox.tsx
│   │   │   │   ├── Archive.tsx
│   │   │   │   ├── Trash.tsx
│   │   │   │   ├── Search.tsx
│   │   │   │   └── Settings.tsx
│   │   │   ├── services/
│   │   │   │   ├── database.ts    # Local SQLite
│   │   │   │   ├── syncManager.ts
│   │   │   │   └── signalrClient.ts
│   │   │   ├── stores/
│   │   │   │   ├── noteStore.ts
│   │   │   │   ├── categoryStore.ts
│   │   │   │   └── syncStore.ts
│   │   │   └── styles/
│   │   │       ├── theme.ts
│   │   │       └── variables.css
│   │   └── public/
│   │       └── tray-icon.png
│   │
│   ├── mobile/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── screens/
│   │   │   │   ├── InboxScreen.tsx
│   │   │   │   ├── NoteEditorScreen.tsx
│   │   │   │   ├── QuickCaptureScreen.tsx
│   │   │   │   ├── ArchiveScreen.tsx
│   │   │   │   ├── TrashScreen.tsx
│   │   │   │   └── SettingsScreen.tsx
│   │   │   ├── services/
│   │   │   │   ├── database.ts
│   │   │   │   ├── syncManager.ts
│   │   │   │   └── signalrClient.ts
│   │   │   └── theme/
│   │   ├── ios/
│   │   │   └── FlashpadWidget/    # iOS Widget extension
│   │   └── android/
│   │       └── app/src/main/java/.../
│   │           └── QuickTileService.java
│   │
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── note.ts
│       │   │   ├── category.ts
│       │   │   ├── sync.ts
│       │   │   └── conflict.ts
│       │   └── api/
│       │       ├── notesApi.ts
│       │       └── categoriesApi.ts
│       └── package.json
│
├── .github/
│   └── workflows/
├── package.json
└── README.md
```

---

## Resolved Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Global Hotkey** | `Ctrl+Alt+N` (Win/Linux), `Cmd+Alt+N` (Mac) | User preference |
| **Server Database** | SQLite | Simpler deployment, sufficient for initial scale |
| **Trash Auto-Delete** | Never | User manually empties trash |
| **Mobile Quick Capture** | Both simultaneously | iOS Widget + Android Quick Tile in Phase 1 |
| **History Retention** | Last 10 versions per note | Safety net for sync conflicts |
| **Quick Capture on Blur** | TBD | Decide during implementation |
| **Category Limits** | None | Allow unlimited categories |
| **Note Length** | None | Plain text, no practical limit |

---

## Next Steps

1. Review and approve this plan
2. Discuss and answer the questions above
3. Clone template and set up project
4. Begin Phase 1 implementation

---

*Plan created: January 2026*
