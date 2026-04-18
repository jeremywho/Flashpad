# Flashpad

A cross-platform quick note capture app for Windows, Mac, iOS, Android, and Web. Capture thoughts instantly with minimal friction.

## Philosophy

**Capture first, organize later.** Flashpad removes barriers between having a thought and saving it. Hit a hotkey, type, done.

## Features

- **Quick Capture**: Global hotkey (`Ctrl+Alt+N`) on desktop, widgets/quick tiles on mobile
- **Cross-Platform**: Windows, Mac, iOS, Android, and Web with real-time sync
- **Offline Support**: Works without internet, syncs when connected
- **Inbox Workflow**: Notes land in inbox, organize when you're ready
- **Categories**: Create custom categories to organize notes
- **Archive & Trash**: Archive old notes, trash with manual empty
- **Dark Mode**: Beautiful dark theme by default (light mode available)
- **Real-time Sync**: Changes sync instantly across all your devices via SignalR
- **Drop Folder**: Drop plain `.md` files into the notes directory and they're automatically ingested and synced

## Tech Stack

| Platform | Technologies |
|----------|-------------|
| **Desktop** | Electron 39, React 19, TypeScript, Vite |
| **Web** | React 19, TypeScript, Vite |
| **Mobile** | React Native 0.83, TypeScript |
| **Backend** | .NET 10, ASP.NET Core, EF Core, SQLite, SignalR |
| **Shared** | TypeScript types and API client |

## Project Structure

```
Flashpad/
├── packages/
│   ├── backend/          # .NET Web API + SignalR
│   ├── electron/         # Electron desktop app
│   ├── web/              # Web app (React)
│   ├── mobile/           # React Native mobile app
│   └── shared/           # Shared TypeScript code
├── FLASHPAD-PLAN.md      # Implementation roadmap
└── README.md
```

## Prerequisites

- **Node.js** 20+ and npm
- **.NET 10 SDK**
- **Git**

### For Mobile Development
- **iOS**: macOS, Xcode 15+, CocoaPods
- **Android**: Android Studio, Android SDK (API 34+), JDK 17+

## Quick Start

### 1. Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd Flashpad

# Install all dependencies (npm workspaces)
npm install

# Build the shared package (required first time)
cd packages/shared && npm run build && cd ../..
```

### 2. Start the Backend

The backend must be running for all clients to work.

```bash
npm run backend
# API: http://localhost:5000
# SignalR Hub: http://localhost:5000/hubs/notes
```

### 3. Run Your Preferred Client

#### Desktop App (Electron)
```bash
npm run electron
```

#### Web App
```bash
# Development (with hot reload)
npm run web
# Open http://localhost:5174

# OR Production (served from backend)
npm run build:web
npm run backend
# Open http://localhost:5000
```

#### Mobile App
```bash
# Android
npm run mobile:android

# iOS (macOS only)
cd packages/mobile/ios && pod install && cd ../../..
npm run mobile:ios
```

## All Available Commands

Run these from the project root:

| Command | Description |
|---------|-------------|
| `npm run backend` | Start the .NET API server |
| `npm run electron` | Start Electron in dev mode |
| `npm run web` | Start web app dev server |
| `npm run mobile` | Start Metro bundler for React Native |
| `npm run mobile:android` | Run Android app |
| `npm run mobile:ios` | Run iOS app |
| `npm run build:electron` | Build Electron for production |
| `npm run build:web` | Build web app to backend/wwwroot |
| `npm run install:all` | Install all dependencies |

## Configuration

### Backend (`packages/backend/appsettings.json`)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=flashpad.db"
  },
  "JwtSettings": {
    "Issuer": "FlashpadAPI",
    "Audience": "FlashpadClients"
  },
  "H4": {
    "Endpoint": "https://h4.gg"
  }
}
```

Supply sensitive backend secrets outside source control:

- `JwtSettings__SecretKey` for JWT signing
- `H4__ApiKey` for H4 ingestion

Production startup fails if either secret is missing.

### Desktop Settings

Configurable in the app's Settings page:
- **Quick Capture Hotkey**: Default `Ctrl+Alt+N` (customizable)
- **Close to Tray**: Keep app running in system tray
- **Start Minimized**: Launch minimized to tray
- **Theme**: Dark, Light, or System

## Usage Guide

### Quick Capture (Desktop)

1. Press `Ctrl+Alt+N` (or your custom hotkey) from anywhere
2. Type your note
3. Press `Ctrl+Enter` to save, or `Esc` to cancel

### Organizing Notes

- **Inbox**: All new notes start here (uncategorized)
- **Categories**: Create categories via "Manage Categories" in sidebar
- **Archive**: Move notes you want to keep but hide from inbox
- **Trash**: Deleted notes go here; empty manually when ready

### Drop Folder (Desktop)

External programs can create notes by dropping plain `.md` files into the Flashpad notes directory. The app watches the folder and automatically:

1. Detects the new file
2. Generates metadata (ID, timestamps, Inbox status)
3. Writes the file back with YAML frontmatter and renames it to `{noteId}.md`
4. Queues it for sync to the server and all other devices

The notes directory location is configurable in Settings. Files with existing frontmatter are loaded as-is.

### Real-time Sync

Notes sync automatically across all your devices when you're online. The connection status indicator shows:
- **No indicator**: Connected and syncing
- **Yellow dot**: Connecting/Reconnecting
- **Red dot**: Offline

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/notes` | List notes (with filters) |
| POST | `/api/notes` | Create note |
| PUT | `/api/notes/{id}` | Update note |
| POST | `/api/notes/{id}/archive` | Archive note |
| POST | `/api/notes/{id}/restore` | Restore note |
| DELETE | `/api/notes/{id}` | Move to trash |
| DELETE | `/api/notes/{id}/permanent` | Delete permanently |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |

## Development

### Project Architecture

- **Monorepo**: npm workspaces manage all packages
- **Shared Code**: Types and API client in `packages/shared`
- **Real-time**: SignalR for instant sync across clients
- **Auth**: JWT tokens stored in localStorage

### Building for Production

```bash
# Build web app
npm run build:web

# Build Electron
npm run build:electron

# Build mobile (see React Native docs)
npm run build:mobile:android
npm run build:mobile:ios
```

## Observability (H4)

Flashpad's backend is instrumented with [H4](https://github.com/jeremywho/H4), our self-hosted observability platform. Logs, traces, and SignalR events are shipped to H4 for debugging sync issues and monitoring production behavior.

**Dashboard:** https://h4.gg

### What's Logged

| Category | Events | Key Metadata |
|----------|--------|-------------|
| **HTTP requests** | Every API call (GET, POST, PUT, DELETE) | method, path, statusCode, durationMs, userId, query params |
| **Note operations** | Create, update, archive, restore, trash | userId, noteId, deviceId, version, categoryId, content preview |
| **Note queries** | List and fetch operations | userId, filters, totalCount, returnedCount |
| **SignalR lifecycle** | Connect, disconnect, device register | userId, connectionId, deviceId, deviceName, totalDevices |
| **SignalR broadcasts** | NoteCreated, NoteUpdated, NoteDeleted, NoteStatusChanged | userId, noteId, version, connectedDevices count, all connected deviceIds |
| **Request tracing** | Auto-trace per HTTP request with span timing | method, path, statusCode, durationMs |

### Debugging Sync Issues

When notes aren't syncing between clients, check H4 for:

1. **Are both clients connected?** Filter for `SignalR connected` and compare the `existingDeviceCount` / `totalDevices` counts as clients join
2. **Did the device register?** Look for `Device registered` with `totalDevices=2` (or however many clients are open). If you see `SignalR disconnected (no device registration)`, a client connected but never registered and never entered presence tracking
3. **Was the broadcast sent?** After a note create/update, look for `Broadcasting NoteCreated/Updated` — the `connectedDevices` count tells you how many clients were in the SignalR group at broadcast time
4. **Did the API call succeed?** Check for the HTTP request log (`POST /api/notes → 201`) with the userId and response timing
5. **Is there a disconnect pattern?** Look for `SignalR disconnected` entries — frequent disconnects with reconnects suggest network instability

### Configuration

The H4 SDK endpoint lives in `packages/backend/appsettings.json` (dev) and `appsettings.Production.json` (prod). Supply the H4 API key via `H4__ApiKey` instead of committing it in config:

```json
{
  "H4": {
    "Endpoint": "https://h4.gg"
  }
}
```

The integration is in three places:
- `Program.cs` — `AddH4()` service registration + `UseH4Tracing()` and `H4RequestLoggingMiddleware` in the middleware pipeline
- `Controllers/NotesController.cs` — explicit logging on note CRUD operations via `IH4Logger`
- `Hubs/NotesHub.cs` — SignalR lifecycle and broadcast logging via `IH4Logger`

### Deploying Backend with H4

```bash
cd packages/backend
dotnet publish -c Release -o publish
scp -r publish/* jeremy@flashpad.cc:/var/www/flashpad/api/
ssh jeremy@flashpad.cc "sudo systemctl restart flashpad-api"
```

Make sure the server provides both `JwtSettings__SecretKey` and `H4__ApiKey` in the process environment before restarting the API.

## Roadmap

See [FLASHPAD-PLAN.md](FLASHPAD-PLAN.md) for the detailed implementation plan.

- [x] **Phase 1**: MVP - Notes, categories, real-time sync
- [ ] **Phase 2**: Conflict resolution
- [ ] **Phase 3**: Push notifications
- [ ] **Phase 4**: Rich text/markdown
- [ ] **Phase 5**: Tags, sharing, collaboration

## License

MIT License
