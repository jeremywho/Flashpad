# Sync Architecture

This document explains how Flashpad synchronizes notes across devices in real-time.

## Overview

Flashpad uses a **push-based sync model**:
- **HTTP** for writes (create, update, delete)
- **SignalR** for real-time broadcasts to all connected clients

Clients don't need to poll or fetch after changes - they receive the full data via SignalR events.

## Data Flow

```
┌─────────────┐     HTTP POST/PUT      ┌─────────────┐
│   Client    │ ─────────────────────► │   Backend   │
│  (Electron) │                        │  Controller │
└─────────────┘                        └──────┬──────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │   SQLite    │
                                       │  Database   │
                                       └──────┬──────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ HubService  │
                                       │ .Notify...  │
                                       └──────┬──────┘
                                              │
                              SignalR broadcast to user_{userId} group
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │  Electron   │           │   Mobile    │           │     Web     │
             │  (sender)   │           │             │           │             │
             └─────────────┘           └─────────────┘           └─────────────┘
```

## Step-by-Step Flow

### 1. Client Makes HTTP Request

When a user creates or updates a note, the client calls the REST API:

```typescript
// From SyncManager
await api.createNote({ content, categoryId, deviceId });
await api.updateNote(noteId, { content, categoryId, deviceId });
```

### 2. Backend Saves to Database

The controller saves the note to SQLite:

```csharp
// NotesController.cs
_context.Notes.Add(note);
await _context.SaveChangesAsync();
```

### 3. Backend Broadcasts via SignalR

After saving, the controller notifies all connected clients:

```csharp
// NotesController.cs:176
await _hubService.NotifyNoteCreated(userId, response);

// NotesController.cs:249
await _hubService.NotifyNoteUpdated(userId, response);
```

### 4. SignalR Pushes Full Data

The hub service broadcasts the **complete note object** (not just an ID):

```csharp
// NotesHub.cs
public async Task NotifyNoteCreated(int userId, NoteResponseDto note)
{
    await _hubContext.Clients.Group($"user_{userId}").SendAsync("NoteCreated", note);
}
```

### 5. Clients Receive and Update State

Each connected client receives the event and updates its local state:

```typescript
// Home.tsx (Electron/Web)
onNoteCreated: (note) => {
  setNotes((prev) => {
    if (prev.some((n) => n.id === note.id)) return prev;
    return [note, ...prev];
  });
}
```

## SignalR Events

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `NoteCreated` | Full `NoteResponseDto` | POST /api/notes |
| `NoteUpdated` | Full `NoteResponseDto` | PUT /api/notes/{id}, POST /api/notes/{id}/move |
| `NoteStatusChanged` | Full `NoteResponseDto` | POST /api/notes/{id}/archive, /restore |
| `NoteDeleted` | `noteId` (GUID) | DELETE /api/notes/{id}, /permanent |
| `CategoryCreated` | Full `CategoryResponseDto` | POST /api/categories |
| `CategoryUpdated` | Full `CategoryResponseDto` | PUT /api/categories/{id} |
| `CategoryDeleted` | `categoryId` (GUID) | DELETE /api/categories/{id} |

## User Groups

Each user is placed in a SignalR group named `user_{userId}`. When a client connects:

```csharp
// NotesHub.cs
public override async Task OnConnectedAsync()
{
    var userId = GetCurrentUserId();
    await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
}
```

This ensures broadcasts only go to that user's devices, not other users.

## Deduplication

Since the client that made the change also receives the SignalR broadcast, we deduplicate:

```typescript
onNoteCreated: (note) => {
  setNotes((prev) => {
    // Skip if we already have this note (from our own HTTP response)
    if (prev.some((n) => n.id === note.id)) return prev;
    return [note, ...prev];
  });
}
```

## Offline Support

When offline, the `SyncManager` queues changes locally and syncs when connectivity is restored. See `packages/*/src/services/syncManager.ts` for implementation details.

## Device Presence

SignalR also tracks which devices are connected for a user:

- `RegisterDevice(deviceId, deviceName)` - Client registers on connect
- `PresenceUpdated` - Broadcast when devices connect/disconnect
- `DeviceConnected` / `DeviceDisconnected` - Individual device events

This powers the "connected devices" indicator in the UI.

## Key Files

| File | Purpose |
|------|---------|
| `packages/backend/Controllers/NotesController.cs` | HTTP endpoints, triggers SignalR broadcasts |
| `packages/backend/Hubs/NotesHub.cs` | SignalR hub and broadcast service |
| `packages/shared/src/signalr-client.ts` | Client-side SignalR connection |
| `packages/*/src/services/syncManager.ts` | Client sync logic and offline queue |
| `packages/*/src/pages/Home.tsx` | SignalR event handlers |
