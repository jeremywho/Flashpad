# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Getting Started

When starting work on this project, read the following documentation files:
- `FLASHPAD-PLAN.md` - Detailed implementation plan and phase checklist
- `DEPLOY.md` - Deployment and release procedures
- `README.md` - User-facing documentation

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
├── .github/workflows/   # GitHub Actions (release.yml)
├── deploy/              # Server setup scripts
├── FLASHPAD-PLAN.md     # Detailed implementation plan
├── DEPLOY.md            # Deployment & release documentation
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

### Development
| App | API URL |
|-----|---------|
| Electron | `http://localhost:5000` |
| Web (dev) | `http://localhost:5000` |
| Android Emulator | `http://10.0.2.2:5000` |
| iOS Simulator | `http://localhost:5000` |

### Production
| Service | URL |
|---------|-----|
| API | `https://api.flashpad.cc` |
| Web App | `https://flashpad.cc` |

### Environment Files
- `packages/web/.env.development` / `.env.production`
- `packages/electron/.env.development` / `.env.production`
- `packages/mobile/src/config.ts` → Defaults to production for Release builds, local for Debug. Can be overridden in Account Settings (persisted to AsyncStorage)
- `packages/backend/appsettings.json` / `appsettings.Production.json`

### Running Against Production API
```bash
npm run electron:prod   # Electron app → production API
npm run web:prod        # Web app → production API
```

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

## Releases

Electron releases are triggered **only** by pushing a version tag (not regular commits):

```bash
# Create a release
git tag v0.2.0
git push origin v0.2.0
```

This triggers GitHub Actions to build for Windows, macOS, and Linux, then publishes to GitHub Releases. Auto-updates are enabled.

See `DEPLOY.md` for full deployment documentation.

## Server Deployment

The production server runs on Ubuntu 24.04 with:
- .NET 9 ASP.NET Runtime
- Caddy as reverse proxy
- systemd for the API service (`flashpad-api`)
- Daily SQLite backups at 2 AM (7-day retention)

### Quick Deploy Commands
```bash
# Deploy backend
cd packages/backend && dotnet publish -c Release -o publish
scp -r publish/* jeremy@flashpad.cc:/var/www/flashpad/api/
ssh jeremy@flashpad.cc "sudo systemctl restart flashpad-api"

# Deploy web
cd packages/web && npm run build
scp -r dist/* jeremy@flashpad.cc:/var/www/flashpad/web/
```

## Important Notes

- **Node.js 20+** required
- **Shared package** must be built before running frontends
- **Database** (`flashpad.db`) auto-created on first backend run
- **JWT secret** in `appsettings.Production.json` (gitignored, only on server)
- **CORS** configured in `appsettings.json` (dev) and `appsettings.Production.json` (prod)
- **Full deployment docs** in `DEPLOY.md`

### iOS Bundle Identifiers
- Main app: `cc.flashpad.mobile`
- Widget: `cc.flashpad.mobile.widget`

### Building iOS for Physical Device
1. Update `.xcode.env.local` to point to Node 20+ (nvm path may differ per machine)
2. Open `mobile.xcworkspace` in Xcode
3. Select `mobile-release` scheme for Release builds
4. Select your device and build

## Future Roadmap

### Phase 2: Conflict Resolution
- Version-aware writes with conflict detection
- Conflict resolution UI on all platforms
- No automatic overwrites on stale versions

### Phase 3: Push Notifications
- FCM/APNS integration
- Background sync triggers

### Phase 4: Rich Text
- Markdown editor
- Image attachments

### Phase 5: Encryption at Rest
- Field-level encryption for `Note.Content` using AES-256-GCM
- Encryption key stored in environment variable (not config files)
- Encrypt before saving to DB, decrypt when reading
- Protects against: database file leaks, SQL injection returning raw data, backup exposure
- Does NOT protect against: full server compromise (for that, need E2EE - see below)
- Consider: migration path for existing unencrypted notes

#### Future E2EE Option (if needed)
- Client-side encryption with user passphrase
- Master key encrypted with passphrase-derived key, stored on server
- Recovery key for passphrase reset scenarios
- Trade-off: server cannot recover data if passphrase forgotten

## Design Decisions

- **Trash retention**: Never auto-delete (user manually empties)
- **History retention**: Last 10 versions per note
- **Theme**: Dark mode default, indigo accent (`#6366f1`)
