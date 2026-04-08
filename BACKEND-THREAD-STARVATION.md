# Backend Thread Pool Starvation Issue

## Discovery Date
2026-04-08

## Summary
The .NET backend becomes permanently unresponsive to HTTP requests after an Electron app establishes and then terminates a SignalR WebSocket connection. The backend process stays alive (PID exists, no crash) but stops accepting new HTTP requests — all connections hang indefinitely.

## How to Reproduce
1. Start the backend (`dotnet run` or `dotnet exec Flashpad.dll`)
2. Register a user and obtain a JWT token
3. Launch the Electron app, which connects to the backend via SignalR WebSocket at `/hubs/notes`
4. Kill the Electron app (SIGKILL)
5. Attempt any HTTP request to the backend (e.g., `POST /api/auth/login`)
6. The request hangs forever. The backend never responds.

This is 100% reproducible. A single SignalR WebSocket connection followed by abrupt termination is sufficient to trigger it.

## Impact
- **E2E tests**: Cannot run multiple Electron-based tests sequentially against the same backend. Each test requires a fresh backend process. The E2E runner (`e2e/run-all.mjs`) works around this by killing and restarting the backend between tests.
- **Production**: Unknown impact. In production, Electron apps close via `app.quit()` (graceful) rather than SIGKILL, and the backend runs behind Caddy reverse proxy. The issue may not manifest with graceful disconnects, or Caddy's connection handling may mask it.
- **Multi-device sync testing**: Cannot test two Electron apps talking to the same backend in a single test run.

## Root Cause Analysis

### Confirmed
- The backend is a .NET 10 ASP.NET Core app with SignalR, EF Core (SQLite), and the H4 observability SDK
- The issue occurs AFTER the WebSocket connection is closed, not during
- Simple HTTP negotiate requests (`POST /hubs/notes/negotiate`) do NOT trigger the issue
- Only sustained WebSocket connections trigger it
- The backend process is alive (not crashed) but all thread pool threads appear blocked

### Suspected: H4 BatchSender Lock Contention
The H4 SDK's `BatchSender` (at `H4/src/H4.Sdk.DotNet/BatchSender.cs`) uses a synchronous `Lock` to protect its buffer:

```csharp
private readonly Lock _lock = new();

public void Add(object item)
{
    lock (_lock)
    {
        _buffer.Add(item);
        shouldFlush = _buffer.Count >= _bufferSize;
    }
    if (shouldFlush)
        _ = FlushAsync();  // fire-and-forget
}

public async Task FlushAsync()
{
    lock (_lock)  // synchronous lock in async method
    {
        batch = [.. _buffer];
        _buffer.Clear();
    }
    // ... HTTP POST with retries and exponential backoff
}
```

The problem pattern:
1. `FlushAsync` is called fire-and-forget, runs on a thread pool thread
2. `FlushAsync` acquires `lock (_lock)`, copies the buffer, releases the lock
3. `FlushAsync` then calls `await _http.SendAsync()` which may block waiting for a thread pool thread
4. If the H4 endpoint is unreachable (e.g., no API key configured), `SendAsync` fails after a timeout
5. The retry logic adds `Task.Delay` with exponential backoff (1s, 2s, 4s)
6. Meanwhile, every incoming HTTP request to the backend triggers `h4.Info()` calls in middleware, controllers, and hubs
7. Each `h4.Info()` call goes through `Add()` which acquires `lock (_lock)`
8. If enough `FlushAsync` retries are queued, thread pool threads get consumed waiting for HTTP timeouts
9. Eventually, no thread pool threads are available to process new HTTP requests

This is the classic "async over sync" thread pool starvation pattern in .NET.

### Alternative Hypothesis: ASP.NET SignalR Thread Handling
It's also possible that ASP.NET's SignalR WebSocket handling doesn't properly release threads when a connection is abruptly terminated (SIGKILL rather than graceful close). The `OnDisconnectedAsync` handler may not fire cleanly, leaving resources allocated.

## Workarounds

### For E2E Tests (Implemented)
The test runner (`e2e/run-all.mjs`) kills the backend process between tests and starts a fresh one. Each test gets its own backend lifecycle. The H4 endpoint is pointed at the backend itself (`H4__Endpoint=http://localhost:{port}`) so failed flush attempts get a fast 404 response instead of connection timeouts.

### For Production
Not yet needed — the issue may not manifest with graceful disconnects. Monitor for symptoms (backend stops responding while process is alive) and restart the service if it occurs.

## Recommended Fixes

### Fix 1: Replace `Lock` with `SemaphoreSlim` in H4 BatchSender (Quick Fix)
Replace the synchronous `lock` with an async-compatible `SemaphoreSlim`:

```csharp
private readonly SemaphoreSlim _semaphore = new(1, 1);

public void Add(object item)
{
    _semaphore.Wait();
    try
    {
        _buffer.Add(item);
        shouldFlush = _buffer.Count >= _bufferSize;
    }
    finally { _semaphore.Release(); }
    
    if (shouldFlush)
        _ = FlushAsync();
}

public async Task FlushAsync()
{
    await _semaphore.WaitAsync();
    List<object> batch;
    try
    {
        if (_buffer.Count == 0) return;
        batch = [.. _buffer];
        _buffer.Clear();
    }
    finally { _semaphore.Release(); }
    // ... rest of flush
}
```

### Fix 2: Add HTTP Timeout to H4 BatchSender (Quick Fix)
The `HttpClient` used by `BatchSender` should have a short timeout (e.g., 5 seconds) to prevent thread pool threads from being blocked on long HTTP waits:

```csharp
_http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
```

### Fix 3: Disable H4 When No API Key is Configured
If `H4:ApiKey` is empty, register a no-op `IH4Logger` implementation that discards all events instead of buffering and attempting to flush them.

### Fix 4: Increase .NET Thread Pool Minimum Threads
As a band-aid, increase the minimum thread pool size to prevent starvation:

```csharp
ThreadPool.SetMinThreads(100, 100);
```

### Fix 5: Investigate SignalR Disconnect Handling
Add logging around `OnDisconnectedAsync` to confirm it fires correctly on abrupt client termination. If it doesn't fire, the connection resources may leak.

## Files Involved
- `H4/src/H4.Sdk.DotNet/BatchSender.cs` — Lock contention source
- `H4/src/H4.Sdk.DotNet/H4TracingMiddleware.cs` — Middleware that logs every request
- `packages/backend/Hubs/NotesHub.cs` — SignalR hub with H4 logging
- `packages/backend/Program.cs` — H4 service registration (line 67)
