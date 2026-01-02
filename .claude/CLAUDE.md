# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flashpad is a cross-platform quick note capture application with:
- **Backend**: .NET 9 Web API with SQLite, JWT auth, and SignalR for real-time sync
- **Electron**: Desktop app with global hotkey (`Ctrl+Alt+N`) and quick capture popup
- **Web**: React web app served from the backend
- **Mobile**: React Native CLI for iOS/Android
- **Shared**: TypeScript types, API client, and SignalR client

**Philosophy**: Capture first, organize later. Minimal friction for note-taking.

## Quick Reference Commands

```bash
# From project root
npm run backend          # Start .NET API (port 5000)
npm run electron         # Start Electron dev server
npm run web              # Start web dev server (port 5174)
npm run mobile           # Start Metro bundler
npm run mobile:android   # Run on Android emulator
npm run mobile:ios       # Run on iOS simulator

# Build commands
npm run build:web        # Build web to backend/wwwroot
npm run build:electron   # Build Electron for production

# Build shared (required before frontends on fresh clone)
cd packages/shared && npm run build
```

## Architecture

```
Flashpad/
├── packages/
│   ├── backend/         # ASP.NET Core 9 API
│   │   ├── Controllers/ # Auth, Users, Notes, Categories
│   │   ├── Hubs/        # SignalR hub for real-time sync
│   │   ├── Models/      # User, Note, Category, NoteHistory
│   │   ├── Data/        # EF Core DbContext
│   │   └── wwwroot/     # Built web app (served in production)
│   ├── electron/        # Desktop app
│   │   ├── electron/    # Main process (main.ts, preload.ts)
│   │   └── src/         # React app (pages/, components/)
│   ├── web/             # Web app
│   │   └── src/         # React app (mirrors electron/src)
│   ├── mobile/          # React Native app
│   │   └── src/         # Screens, navigation
│   └── shared/          # Shared TypeScript code
│       └── src/         # types.ts, api-client.ts, signalr-client.ts
├── FLASHPAD-PLAN.md     # Detailed implementation plan
└── README.md            # User documentation
```

## Key Data Models

### Note
```typescript
enum NoteStatus { Inbox = 0, Archived = 1, Trash = 2 }

interface Note {
  id: string;
  content: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  status: NoteStatus;
  version: number;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  noteCount: number;
}
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create user
- `POST /api/auth/login` - Get JWT token

### Users
- `GET /api/users/me` - Get profile
- `PUT /api/users/me` - Update profile

### Notes
- `GET /api/notes` - List notes (query: status, categoryId, search, page, pageSize)
- `GET /api/notes/{id}` - Get single note
- `POST /api/notes` - Create note
- `PUT /api/notes/{id}` - Update note
- `POST /api/notes/{id}/archive` - Archive note
- `POST /api/notes/{id}/restore` - Restore note
- `DELETE /api/notes/{id}` - Move to trash
- `DELETE /api/notes/{id}/permanent` - Delete permanently
- `POST /api/notes/empty-trash` - Empty trash
- `POST /api/notes/{id}/move` - Move to category
- `GET /api/notes/{id}/history` - Get version history

### Categories
- `GET /api/categories` - List categories
- `GET /api/categories/{id}` - Get category
- `POST /api/categories` - Create category
- `PUT /api/categories/{id}` - Update category
- `DELETE /api/categories/{id}` - Delete category
- `POST /api/categories/reorder` - Reorder categories

### SignalR Hub (`/hubs/notes`)
Events broadcast to user's group:
- `NoteCreated` - New note created
- `NoteUpdated` - Note content/category changed
- `NoteDeleted` - Note permanently deleted
- `NoteStatusChanged` - Note archived/restored/trashed
- `CategoryCreated`, `CategoryUpdated`, `CategoryDeleted`

## Network Configuration

| App | API URL |
|-----|---------|
| Electron | `http://localhost:5000` |
| Web (dev) | `http://localhost:5000` (proxied from 5174) |
| Web (prod) | Same origin (served from backend) |
| Android Emulator | `http://10.0.2.2:5000` |
| iOS Simulator | `http://localhost:5000` |

## Desktop Features

### Quick Capture
- **Hotkey**: `Ctrl+Alt+N` (configurable in settings)
- **Window**: Frameless, always-on-top, auto-focus
- **Submit**: `Ctrl+Enter` or click Save
- **Cancel**: `Escape` key

### System Tray
- Click to show/hide window (Windows)
- Double-click to show (macOS/Linux)
- Right-click for context menu
- "Close to tray" option in settings

## Theme

CSS variables in `:root` and `[data-theme="light"]`:
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--accent-color`: `#6366f1` (indigo)
- `--danger-color`: `#ef4444`

## Working in This Codebase

### Adding a New Feature
1. Backend: Add model, DbSet, controller
2. Shared: Update types.ts and api-client.ts
3. Rebuild shared: `cd packages/shared && npm run build`
4. Frontend: Add components/pages

### Key Files to Know
- `packages/backend/Program.cs` - App setup, middleware
- `packages/shared/src/types.ts` - All TypeScript types
- `packages/shared/src/api-client.ts` - API wrapper
- `packages/shared/src/signalr-client.ts` - Real-time sync
- `packages/electron/electron/main.ts` - Electron main process
- `packages/*/src/pages/Home.tsx` - Main app page

### Inbox Logic
Notes with `status=Inbox` and `categoryId=null` appear in Inbox.
Notes with a category appear under that category, not Inbox.

## Important Notes

- **Node.js 20+** required
- **Shared package** must be built before running frontends
- **Database** (`flashpad.db`) auto-created on first backend run
- **JWT secret** in `appsettings.json` (change for production!)
- **CORS** configured for localhost dev ports
