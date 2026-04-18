# Claude Remote Bot — Design Spec

**Date:** 2026-03-18
**Status:** Reviewed
**Repo:** New standalone repository (`claude-remote-bot`)

## Overview

A standalone Discord bot that spawns and manages Claude Code remote sessions on the host machine. Users request sessions via Discord messages, and the bot returns a `claude.ai/code` URL to connect with the Claude app.

Single-purpose: this bot does one thing — manage Claude Code remote sessions via Discord.

## Goals

- Start Claude Code remote sessions from Discord with a working directory
- Support multiple concurrent sessions, each identified by a short name
- Persist session state across bot restarts (sessions outlive the bot)
- Notify on Discord when sessions die unexpectedly
- Cross-platform: macOS and Windows
- Distributable as a single compiled binary via `bun build --compile`

## Non-Goals

- No web UI or dashboard
- No multi-user support (single owner only)
- No session resumption (Claude sessions are ephemeral — dead means start a new one)
- No slash commands or Discord interactions API — plain message prefix only

## Tech Stack

- **Runtime:** Bun (TypeScript)
- **Discord:** Discord.js
- **Distribution:** `bun build --compile` for single-binary output
- **Process management:** Node `child_process.spawn` (available in Bun)

## Configuration

Via environment variables (with optional `config.json` fallback):

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CHANNEL_ID` | Channel to listen in | Yes |
| `DISCORD_OWNER_ID` | Authorized Discord user ID | Yes |
| `DATA_DIR` | Directory for state and logs | No (default: `./data`) |

The bot ignores all messages except those from `DISCORD_OWNER_ID` in `DISCORD_CHANNEL_ID`.

## Project Structure

```
claude-remote-bot/
├── src/
│   ├── index.ts           # Entry point — load config, wire up bot + session manager
│   ├── config.ts          # Load config from env vars or config.json
│   ├── bot.ts             # Discord client, command parsing, responses
│   ├── session-manager.ts # Multi-session lifecycle, state persistence, health checks
│   └── process-spawner.ts # Spawn claude remote-control, poll for URL, manage process
├── package.json
├── tsconfig.json
└── README.md
```

## Commands

All commands use the `!remote` prefix and are only accepted from the configured owner in the configured channel.

| Command | Description |
|---------|-------------|
| `!remote start <path>` | Start a session in the given directory. `<path>` is everything after `start ` (supports spaces in paths without quoting). |
| `!remote stop <name>` | Stop a specific session by name |
| `!remote stop-all` | Stop all active sessions |
| `!remote list` | Show all active sessions |
| `!remote status` | Alias for `list` |

## Data Model

### Session

```typescript
interface Session {
  name: string;        // Derived from directory basename (e.g., "Flashpad")
  pid: number;         // OS process ID
  url: string;         // claude.ai/code session URL
  cwd: string;         // Working directory
  startedAt: string;   // ISO 8601 timestamp
  stdoutFile: string;  // Path to stdout log file
  stderrFile: string;  // Path to stderr log file
}
```

### State Persistence

- All sessions saved to `DATA_DIR/sessions.json` on every mutation
- On startup, sessions are restored from disk and each PID is health-checked
- Dead sessions are cleaned up; live sessions are re-adopted

## Module Design

### `config.ts`

Loads configuration from environment variables. Falls back to `config.json` adjacent to the binary (resolved via the binary's directory, not `process.cwd()`). Validates all required fields are present and exits with a helpful error if not.

### `bot.ts`

- Creates a Discord.js `Client` with `MessageContent` and `GuildMessages` intents
- Listens for `messageCreate` events
- Filters: must be from `DISCORD_OWNER_ID`, in `DISCORD_CHANNEL_ID`, starting with `!remote`
- Parses command and argument, delegates to session manager
- Formats and posts responses to Discord

### `session-manager.ts`

Manages the lifecycle of multiple concurrent sessions.

**`start(path: string)`**
1. Validate the directory exists
2. Derive session name from `path.basename(path)`
3. If name collides with an active session, append `-2`, `-3`, etc. (finds the lowest unused suffix)
4. Call process spawner to start `claude remote-control`
5. Save state to disk
6. Return session name and URL

**`stop(name: string)`**
1. Find session by name (case-insensitive match)
2. Kill the process (`SIGTERM`)
3. Remove from state, save to disk

**`stopAll()`**
1. Stop all sessions

**`list()`**
1. Return all active sessions with name, URL, and uptime

**Health monitor:**
- Runs every 30 seconds
- Checks each session PID with `process.kill(pid, 0)`
- Dead sessions are removed from state
- Returns list of sessions that died (bot posts notifications)

### `process-spawner.ts`

Handles the low-level process spawning.

**`spawn(name: string, cwd: string)`**
1. Open file descriptors for `DATA_DIR/<name>.stdout` and `DATA_DIR/<name>.stderr`
2. Spawn `claude remote-control --name "<name>" --permission-mode bypassPermissions` with:
   - `cwd` set to the requested directory
   - `stdio: ['pipe', stdoutFd, stderrFd]`
   - `detached: true`
   - `windowsHide: true` (prevents visible console window on Windows)
3. Write `y\n` to stdin to auto-accept the "Enable Remote Control?" prompt
4. Close stdin
5. Call `proc.unref()` to fully detach
6. Close file descriptors in the parent
7. Poll stdout file every 200ms for a `https://claude.ai/code` URL
8. Timeout after 30 seconds — kill process if no URL appears
9. Return `{ pid, url, stdoutFile, stderrFile }` on success

**Why file-based output:**
- Detached process survives bot restarts
- No SIGPIPE when the bot dies
- State reconstructable from disk

## Discord Response Formats

**Start success:**
> **Flashpad** started
> `https://claude.ai/code/abc123`

**Start failure:**
> Failed to start session: Directory not found: `C:\Data\Repos\Bad`

**List (with sessions):**
> **Active Sessions (2)**
> **Flashpad** — `https://claude.ai/code/abc123` — up 24m
> **TrainerRoadWeb** — `https://claude.ai/code/def456` — up 3h 12m

**List (empty):**
> No active sessions

**Stop:**
> **Flashpad** session ended

**Stop not found:**
> No session named **X**. Use `!remote list` to see active sessions.

**Missing argument:**
> Usage: `!remote start <path>`

**Unknown command:**
> Usage: `!remote start <path>` | `!remote stop <name>` | `!remote stop-all` | `!remote list`

**Death notification (from health monitor):**
> **Flashpad** session ended unexpectedly

## Startup Sequence

1. Load config (env vars → `config.json` fallback)
2. Verify `claude` is on PATH — exit with helpful error if not
3. Load persisted sessions from `sessions.json`
4. Health-check each restored session (is PID alive?)
5. Clean up dead sessions, keep live ones
6. Connect to Discord
7. Post startup message: "Bot online. **N** session(s) restored." (or "Bot online. No active sessions.")
8. Start health monitor interval (every 30s)

## Shutdown Behavior

On SIGINT/SIGTERM:
1. Stop health monitor
2. Disconnect from Discord
3. Sessions are **left running** — they are detached processes
4. On next startup, they get re-adopted via PID check

**Key principle:** The bot is a management layer, not a session parent. Sessions outlive the bot.

## Cross-Platform Considerations

| Concern | Approach |
|---------|----------|
| Path separator in name derivation | `path.basename()` handles both `/` and `\` |
| Process alive check | `process.kill(pid, 0)` works on both macOS and Windows |
| Kill process | `process.kill(pid, 'SIGTERM')` — on Windows this is a hard kill (no graceful SIGTERM), which is acceptable |
| `detached: true` | macOS: new process group. Windows: new console (use `windowsHide: true` to prevent visible window). Both keep process alive after bot exits. |
| Claude CLI binary | Use `claude` — verify on PATH at startup with helpful error |

No platform-specific code branches needed. Node/Bun abstracts the differences.

## Build & Distribution

```bash
# Development
bun run src/index.ts

# Compile to single binary
bun build --compile src/index.ts --outfile claude-remote-bot

# Cross-compile
bun build --compile src/index.ts --target=bun-darwin-arm64 --outfile claude-remote-bot-macos
bun build --compile src/index.ts --target=bun-windows-x64 --outfile claude-remote-bot-windows.exe
```

## Error Handling

- **Discord disconnection:** Discord.js auto-reconnects. No special handling needed.
- **Spawn failure:** Return error message to Discord with the error detail.
- **URL poll timeout:** Kill the spawned process, return timeout error to Discord.
- **Invalid path:** Check `fs.existsSync` before spawning, return clear error.
- **PID check fails during health monitor:** Remove session, notify on Discord.
- **Config missing:** Exit at startup with clear message about what's missing.
- **Log file cleanup:** Session stdout/stderr files are deleted when a session is stopped or cleaned up by the health monitor.
- **PID recycling on re-adoption:** On startup, PID-alive check may give false positives if the OS recycled the PID. Accepted as a v1 limitation — user can `!remote stop` and restart if a session URL is stale.
- **Stale URLs:** Claude remote sessions may expire server-side while the process is still alive. The bot cannot detect this. User should `!remote stop` and start a new session if the URL stops working.
