# H4 — DIY Observability Platform

**Date:** 2026-04-02
**Status:** Approved
**Domain:** h4.gg

## Overview

H4 is a self-hosted observability platform providing structured logging, real-time log streaming, and request tracing. It is designed as a standalone, multi-project tool — any application can integrate via lightweight client SDKs that ship data to the H4 backend over HTTP.

The first integration target is Flashpad (notes app with .NET backend, React web, Electron desktop, and React Native mobile clients).

## V1 Scope

- Structured log ingestion and querying
- Real-time log streaming (live tail)
- Request tracing with waterfall span visualization
- Multi-project support via API keys
- TypeScript and .NET client SDKs

## Out of V1 Scope (Future Roadmap)

1. Metrics & charts (request counts, error rates, response times)
2. Alerts (Discord webhook, email notifications on rules)
3. Health checks / uptime monitoring
4. Log-to-metric extraction
5. Saved views / bookmarked filter presets

---

## Repository Structure

```
h4/
├── src/
│   ├── H4.Server/              # .NET 10 ASP.NET Core monolith
│   │   ├── Controllers/        # API endpoints (ingest, query, traces)
│   │   ├── Hubs/               # SignalR hub for live tail
│   │   ├── Services/           # Background workers, channel processing
│   │   ├── Data/               # EF Core context, migrations, models
│   │   └── Program.cs
│   ├── H4.Sdk.DotNet/          # .NET client SDK
│   └── h4-sdk-ts/              # TypeScript client SDK
├── dashboard/                  # React frontend (Vite)
│   └── src/
├── deploy/                     # Docker, Caddy config, deploy scripts
├── docs/
└── docker-compose.yml
```

- Server, both SDKs, and dashboard all in one repo for development convenience.
- Dashboard is a separate Vite app, built to static files and served by the .NET server in production.
- SDKs are publishable packages (npm / NuGet) developed in-tree.

---

## Architecture

Single .NET 10 monolith with in-memory `Channel<T>` for decoupling ingestion from storage and streaming.

**Design constraints (V1):** This is a single-node, best-effort, hobby-scale system. The in-memory channel means logs buffered but not yet persisted will be lost on crash or restart. This is an accepted trade-off for simplicity — H4 is not designed for mission-critical production observability at this stage.

### Ingestion Flow

```
SDK POST /api/ingest/logs (or /spans)
        │
        ▼
  Auth middleware (validate API key via X-H4-Key header, resolve project_id)
        │
        ▼
  Validate payload (size limits, timestamp bounds, deduplication)
        │
        ▼
  Write to Channel<LogBatch>  ──────► return 202 Accepted (fast, non-blocking)
        │
        ▼
  BackgroundService: Dispatcher (single consumer)
        │    - Drains the channel
        │    - For each batch, dispatches to BOTH:
        │
        ├──► DB Writer
        │    - Buffers items, bulk inserts to Postgres (100 items or every 2 seconds)
        │
        └──► Live Tail Broadcaster
             - Fans out to connected SignalR dashboard clients
             - Filters per-connection (only sends logs matching active filters)
```

The Dispatcher is the sole consumer of the `Channel<T>`. This avoids the point-to-point competing consumer problem — a single reader explicitly fans out each item to both the DB writer and the live tail broadcaster.

Backpressure: Channel has bounded capacity (10,000 items). When full, the ingest endpoint returns 429 so SDKs back off. The SDK will retry with exponential backoff rather than dropping immediately (see SDK section).

---

## Data Model (PostgreSQL)

### Project

| Column         | Type              | Notes                                      |
|----------------|-------------------|--------------------------------------------|
| id             | UUID (PK)         |                                            |
| name           | varchar           | "Flashpad", "hehehe.chat"                  |
| api_key_hash   | varchar (unique)  | SHA-256 hash of the API key                |
| api_key_prefix | varchar           | First 8 chars of key, for display (e.g., "fp_live_ab...") |
| created_at     | timestamptz       |                                            |

API keys are hashed at rest using SHA-256. The plaintext key is shown exactly once at project creation and never stored. The prefix is kept for identification in the UI. On ingest, the server hashes the incoming `X-H4-Key` header and looks up the matching `api_key_hash`.

### LogEntry

| Column      | Type              | Notes                                    |
|-------------|-------------------|------------------------------------------|
| id          | UUID (PK)         |                                          |
| event_id    | varchar (nullable)| SDK-generated, for deduplication on retry |
| project_id  | UUID (FK)         | Which project sent this                  |
| level       | enum              | Debug, Info, Warning, Error, Fatal       |
| message     | text              | Max 32KB                                 |
| timestamp   | timestamptz       | When it happened on the client/server    |
| received_at | timestamptz       | When H4 received it                      |
| source      | varchar           | "backend", "web", "electron", "mobile"   |
| trace_id    | varchar (nullable)| Links to a trace                         |
| span_id     | varchar (nullable)| Links to a span within a trace           |
| metadata    | jsonb             | Arbitrary key/value pairs, max 8KB       |

### Trace

| Column      | Type              | Notes                                |
|-------------|-------------------|--------------------------------------|
| id          | UUID (PK)         |                                      |
| trace_id    | varchar (unique)  | The correlation ID                   |
| project_id  | UUID (FK)         |                                      |
| started_at  | timestamptz       |                                      |
| duration_ms | int (nullable)    | Filled when root span completes      |
| status      | enum              | OK, Error                            |
| metadata    | jsonb             |                                      |

### Span

| Column         | Type              | Notes                                   |
|----------------|-------------------|-----------------------------------------|
| id             | UUID (PK)         |                                         |
| trace_id       | varchar (FK)      |                                         |
| span_id        | varchar           | Unique within the trace (composite unique on trace_id + span_id) |
| parent_span_id | varchar (nullable)| Null for root span                      |
| name           | varchar           | e.g., "POST /api/notes", "DB SaveChanges" |
| source         | varchar           | Which service/client created it         |
| started_at     | timestamptz       |                                         |
| duration_ms    | int               |                                         |
| status         | enum              | OK, Error                               |
| metadata       | jsonb             |                                         |

### Indexing Strategy

- `LogEntry`: composite index on `(project_id, timestamp DESC)` for the main log view
- `LogEntry`: GIN index on `message` for full-text search
- `LogEntry`: index on `trace_id` for trace lookups
- `LogEntry`: unique partial index on `(project_id, event_id) WHERE event_id IS NOT NULL` for deduplication
- `LogEntry.metadata`: GIN index (only on LogEntry — not on Trace or Span metadata, which are rarely queried directly)
- `Span`: index on `trace_id` for waterfall view
- `Span`: composite unique constraint on `(trace_id, span_id)`

GIN indexes are expensive on write-heavy tables. Only `LogEntry.metadata` gets a GIN index since that's the table the dashboard filters against. Trace and Span metadata are only read when viewing a specific trace, so sequential scan is fine there.

### Retention

A background job runs daily and deletes data older than the configured retention period (default 30 days, configurable per project). Retention applies to **all tables**: LogEntry, Trace, and Span. Traces and spans are deleted in the same pass as their associated logs to prevent broken trace views with orphaned references.

### Deduplication

When a LogEntry arrives with a non-null `event_id`, the server checks the unique partial index on `(project_id, event_id)`. If a duplicate exists, the entry is silently dropped (no error returned). This handles SDK retry scenarios where the same batch is sent twice. The `event_id` is generated by the SDK as a UUID per log entry.

---

## API Endpoints

### Ingestion (used by SDKs)

```
POST /api/ingest/logs           # Batch of log entries
POST /api/ingest/spans          # Batch of spans (trace data)
```

Auth: `X-H4-Key` header with project API key. Invalid key = 401.

**Validation rules (applied before writing to channel):**
- Max batch size: 200 log entries or 200 spans per request
- Max request body: 1MB
- Max `message` length: 32KB
- Max `metadata` size: 8KB (serialized JSON)
- Timestamps must be within 24 hours of server time (rejects future-dated or ancient entries)
- `source` must be one of: `backend`, `web`, `electron`, `mobile` (rejects unknown sources)
- Invalid entries within a batch are skipped individually; valid entries in the same batch are still accepted

Ingest payload example:
```json
{
  "logs": [
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "level": "Info",
      "message": "Note created",
      "timestamp": "2026-04-02T10:30:00Z",
      "source": "backend",
      "traceId": "abc-123",
      "spanId": "span-1",
      "metadata": { "userId": 5, "noteId": "guid-here" }
    }
  ]
}
```

### Query (used by dashboard)

```
GET /api/logs
    ?projectId=UUID
    &level=Error                    # Comma-separated for multiple
    &source=backend
    &traceId=abc-123
    &search=failed                  # Full-text search on message
    &from=2026-04-02T00:00:00Z
    &to=2026-04-02T12:00:00Z
    &timePreset=15m                 # Shorthand: 15m/30m/1h/4h/12h/24h/7d
    &cursor=BASE64                   # Opaque cursor encoding (timestamp, id) keyset
    &limit=100

GET /api/traces/{traceId}          # Trace + all spans + associated logs

GET /api/projects                  # List all projects
POST /api/projects                 # Create project, returns API key
```

Pagination is cursor-based using `(timestamp, id)` keyset. No offset pagination. The cursor is an opaque base64-encoded string containing both the timestamp and UUID of the last item. The server decodes it to build the `WHERE (timestamp, id) < (@ts, @id)` keyset query. Responses include a `nextCursor` field (null when no more results).

### Live Tail (SignalR)

```
Hub: /hubs/livetail

Client → Server:
  Subscribe(projectId, filters)     # Start streaming with optional filters
  UpdateFilters(filters)            # Change filters without reconnecting
  Unsubscribe()                     # Stop streaming

Server → Client:
  LogReceived(logEntry)             # Individual log pushed in real-time
```

The hub receives items from the Dispatcher (see Architecture section) — it does not read from the `Channel<T>` directly. The Dispatcher is the sole channel consumer and fans out to both the DB writer and the live tail broadcaster. When live tail is toggled on in the dashboard, it opens the SignalR connection. When switching to a time-bucket view, it disconnects and uses the REST query API.

---

## Client SDKs

Both SDKs share the same design contract:

- Buffer logs in memory
- Flush every 5 seconds OR when buffer hits 50 items OR on explicit `flush()` call
- On HTTP failure, hold the batch and retry with exponential backoff (max 3 retries, then drop)
- Generate and propagate trace IDs and span IDs
- Generate a unique `eventId` (UUID) per log entry for server-side deduplication on retry

### TypeScript SDK (`@h4/sdk`)

Used by Flashpad's web, Electron, and mobile clients.

```typescript
import { H4 } from '@h4/sdk';

const h4 = new H4({
  endpoint: 'https://h4.gg',
  apiKey: 'fp_live_abc123',
  source: 'web',
  metadata: {
    environment: 'production',
    version: '1.2.0'
  }
});

// Logging
h4.info('Note created', { noteId: 'guid', userId: 5 });
h4.error('Sync failed', { error: err.message });

// Tracing
const trace = h4.startTrace('createNote');
const span = trace.startSpan('api-call');
// ... do work ...
span.end();
trace.end();

// Shutdown
await h4.flush();
```

### .NET SDK (`H4.Sdk`)

Used by the Flashpad backend. Integrates with ASP.NET Core middleware.

```csharp
// Program.cs
builder.Services.AddH4(options => {
    options.Endpoint = "https://h4.gg";
    options.ApiKey = "fp_live_abc123";
    options.Source = "backend";
});

app.UseH4Tracing();

// Controller usage via DI
public class NotesController(IH4Logger h4) {
    public IActionResult Create(NoteDto dto) {
        h4.Info("Note created", new { dto.Id, dto.Title });
    }
}
```

The .NET middleware:
- Auto-creates a trace/span per HTTP request
- Reads `X-H4-Trace-Id` header from incoming requests (set by client SDKs) or generates a new one
- Auto-captures request method, path, status code, and duration as a span
- Returns `X-H4-Trace-Id` in the response header

### Trace Propagation Flow

1. Client SDK generates `traceId`, sends it as `X-H4-Trace-Id` header with the API call
2. .NET middleware reads the header, creates a root backend span, tags all logs with the same `traceId`
3. Response includes `X-H4-Trace-Id` header back to client
4. Dashboard waterfall shows: client span → API span → DB span

---

## Dashboard UI

Single-page React app (Vite) with three views.

### Log Explorer (default view)

- **Top bar**: project selector dropdown, time range picker (presets: 15m/30m/1h/4h/12h/24h/7d + custom range), live tail toggle button
- **Filter bar**: level checkboxes (Debug/Info/Warning/Error/Fatal), source filter (backend/web/electron/mobile), free-text search input
- **Log list**: reverse chronological, newest at top. Each row shows:
  - Timestamp (relative like "2s ago" in live tail, absolute in time-bucket mode)
  - Level (color-coded pill: green=Info, yellow=Warning, red=Error)
  - Source (small label)
  - Message (truncated to one line)
  - Trace ID link (if present)
- **Expanded row**: click a log entry to expand inline showing full message, all metadata key/values, and a "View Trace" link
- **Infinite scroll**: loads older entries on scroll-up via cursor pagination

### Trace View

- **Header**: trace ID, total duration, status, timestamp
- **Waterfall**: horizontal bar chart, each span is a row. Indented by parent/child relationship. Bar width = duration relative to total trace time. Color-coded by source (backend=blue, web=purple, mobile=green, electron=orange)
- **Span detail**: click a span to see its metadata and associated log entries inline below it

### Projects Page

- List of registered projects with name, API key prefix (e.g., "fp_live_ab..."), created date, log count
- "New Project" button — creates a project and shows the full plaintext API key exactly once (it is hashed before storage and cannot be retrieved again)

### Dashboard Auth

No user accounts for v1. Dashboard is protected by a single admin token stored as an environment variable (`H4_ADMIN_TOKEN`).

**Login flow:** The dashboard shows a simple token input form. The user enters the admin token, which is sent via `POST /api/auth/login`. If valid, the server returns an HttpOnly, Secure, SameSite=Strict cookie. All subsequent dashboard API requests are authenticated via this cookie. The token is never stored in localStorage, query params, or browser history.

**Session expiry:** Cookie expires after 7 days. Re-enter the token to re-authenticate.

---

## Deployment

### Docker Compose

```yaml
services:
  h4-server:
    # .NET app: API + SignalR + serves dashboard static files
    ports: ["8080:8080"]
    environment:
      - H4_POSTGRES_CONNECTION
      - H4_ADMIN_TOKEN
      - H4_RETENTION_DAYS=30
    depends_on: [h4-postgres]

  h4-postgres:
    image: postgres:17
    volumes: [h4-postgres-data:/var/lib/postgresql/data]
    environment:
      - POSTGRES_DB=h4
      - POSTGRES_USER=h4
      - POSTGRES_PASSWORD=${H4_POSTGRES_PASSWORD}

volumes:
  h4-postgres-data:
```

### Caddy (on VPS)

```
h4.gg {
    reverse_proxy h4-server:8080
}
```

### Environment Variables

| Variable                | Purpose                          | Default |
|------------------------|----------------------------------|---------|
| H4_POSTGRES_CONNECTION | Postgres connection string       | —       |
| H4_ADMIN_TOKEN         | Dashboard access token           | —       |
| H4_RETENTION_DAYS      | Auto-delete logs older than this | 30      |

### Deploy Workflow

Push to repo, SSH to VPS, `docker compose pull && docker compose up -d`. No CI/CD needed.

### Postgres Backups

Daily `pg_dump` via cron. Logs are replaceable data so this is a nice-to-have.
