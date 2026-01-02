# Flashpad Project Journal

## Project Overview

Flashpad is a cross-platform quick note capture application designed for Windows, Mac, iOS, and Android. The core philosophy is **capture first, organize later** - removing friction from the note-taking process.

Built on top of the StarterTemplates foundation (Electron + React Native + .NET), Flashpad extends this with real-time sync, offline support, and quick capture features.

## Original Requirements

The user requested a quick note app with these specifications:

### Core Features
- **Quick Capture**: Global hotkey on desktop (`Ctrl+Alt+N`), widgets/quick tiles on mobile
- **Cross-Platform**: Windows, Mac, iOS, Android with real-time sync
- **Offline Support**: Full offline capability with sync on reconnect
- **Inbox Workflow**: Notes go to inbox first, then organize later
- **Categories**: Organize notes into user-created categories
- **Archive & Trash**: Archive old notes, trash with manual empty

### Technical Requirements
- **Real-time Sync**: WebSocket connection (SignalR) for live updates
- **Conflict Resolution**:
  - Phase 1: Last-write-wins with version history (10 versions)
  - Phase 2: Conflict detection with resolution UI
- **UI/UX**: Modern, sleek design with dark mode default

### User Configuration Choices
- **Global Hotkey**: `Ctrl+Alt+N` (Windows/Linux), `Cmd+Alt+N` (Mac)
- **Server Database**: SQLite (simple deployment)
- **Trash Retention**: Never auto-delete (user manually empties)
- **Mobile Quick Capture**: Both iOS Widget and Android Quick Tile in Phase 1
- **History Retention**: Last 10 versions per note

## Architecture

### Foundation (from StarterTemplates)
```
Flashpad/
├── packages/
│   ├── backend/         # .NET 9 Web API (extended for notes)
│   ├── electron/        # Desktop app (extended for quick capture)
│   ├── mobile/          # React Native (extended for widgets/tiles)
│   └── shared/          # Shared types (extended for note types)
└── FLASHPAD-PLAN.md     # Detailed implementation plan
```

### New Components (Flashpad-specific)
- **SignalR Hub**: Real-time note sync between devices
- **Quick Capture Window**: Small popup for fast note entry
- **Global Shortcuts**: System-wide hotkey registration
- **Local SQLite**: Client-side database for offline support
- **Sync Manager**: Handles offline queue and conflict resolution
- **iOS Widget**: Home/Lock screen quick capture
- **Android Quick Tile**: Notification shade quick access

### Data Model
```
User (existing)
├── Note
│   ├── Id, Content, CategoryId?, Status (inbox/archived/trash)
│   ├── Version (int), CreatedAt, UpdatedAt, DeviceId
│   └── IsDeleted, DeletedAt?
├── Category
│   ├── Id, Name, Color, Icon, SortOrder
│   └── CreatedAt, UpdatedAt
└── NoteHistory
    ├── Id, NoteId, Content, Version
    └── CreatedAt, DeviceId
```

## Implementation Phases

### Phase 1: MVP (Current Focus)
- [ ] Backend: Note/Category CRUD + SignalR hub
- [ ] Desktop: Quick capture popup + main window + local storage
- [ ] Mobile: Core app + widgets/tiles + local storage
- [ ] Theming: Dark/light mode (dark default)

### Phase 2: Conflict Resolution
- [ ] Version-aware writes with conflict detection
- [ ] Conflict resolution UI on all platforms
- [ ] No automatic overwrites on stale versions

### Phase 3: Push Notifications (Future)
- [ ] FCM/APNS integration
- [ ] Background sync triggers

### Phase 4: Rich Text (Future)
- [ ] Markdown editor
- [ ] Image attachments

## Key Technical Decisions

### Sync Strategy
1. **Online Mode**: Changes sent via REST, broadcasted via SignalR
2. **Offline Mode**: Changes queued locally, synced on reconnect
3. **Conflict Handling**:
   - Phase 1: Last-write-wins, previous version saved to history
   - Phase 2: Conflict detection, user resolution UI

### Theme Colors
**Dark Theme (Default)**
- Background: `#0D0D0D`
- Surface: `#1A1A1A`
- Accent: `#6366F1` (indigo)

**Light Theme**
- Background: `#FFFFFF`
- Surface: `#F5F5F5`
- Accent: `#4F46E5` (indigo)

## Project Setup (Completed)

### Branding Updated
- [x] Root package.json: `flashpad` v0.1.0
- [x] Backend: `flashpad.db`, `FlashpadAPI/FlashpadClients` JWT issuer/audience
- [x] Electron: `@flashpad/electron`, `com.flashpad.app`, `Flashpad` product name
- [x] Mobile: `@flashpad/mobile`, `com.flashpad` (Android), `com.flashpad.mobile` (iOS)
- [x] Shared: `@flashpad/shared`

### Security
- [x] New JWT secret generated: `PlpMhX2i7UDAI6s8zMZTkA5p+FGQF3G+woXyBzJS+Ik=`
- [x] App identifiers updated for all platforms

### Dependencies
- [x] All packages installed
- [x] Shared package built
- **Note**: Template requires Node.js 20+, current system has Node 18

## Development Commands

```bash
# From root
npm run backend          # Start .NET API
npm run electron         # Start Electron dev
npm run mobile:android   # Run Android
npm run mobile:ios       # Run iOS

# Build shared (required before Electron/Mobile)
cd packages/shared && npm run build
```

## Important Files

- `FLASHPAD-PLAN.md` - Comprehensive implementation plan
- `packages/backend/appsettings.json` - JWT config, DB connection
- `packages/electron/electron/main.ts` - Main process, tray, shortcuts
- `packages/mobile/app.json` - Mobile app config

## Next Steps

See `FLASHPAD-PLAN.md` Phase 1 for detailed implementation checklist:
1. Backend: Create Note/Category models and API
2. Backend: Add SignalR hub for real-time sync
3. Desktop: Implement quick capture popup
4. Desktop: Create inbox/note management UI
5. Mobile: Create inbox/note screens
6. Mobile: Implement widgets/quick tiles

---

**Last Updated:** January 2026
**Status:** Project Setup Complete, Ready for Phase 1 Implementation
