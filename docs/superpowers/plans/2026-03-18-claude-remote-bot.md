# Claude Remote Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Discord bot that spawns and manages Claude Code remote sessions on the host machine.

**Architecture:** Modular TypeScript app with three core modules — Discord bot (command parsing/responses), session manager (multi-session lifecycle/persistence), and process spawner (claude CLI process management). Compiles to a single binary via `bun build --compile`.

**Tech Stack:** Bun, TypeScript, Discord.js

**Spec:** `docs/superpowers/specs/2026-03-18-claude-remote-bot-design.md`

---

## File Structure

```
claude-remote-bot/
├── src/
│   ├── index.ts           # Entry point — load config, wire up bot + session manager, shutdown handlers
│   ├── config.ts          # Load config from env vars / config.json, validate required fields
│   ├── bot.ts             # Discord client, command parsing, message filtering, response formatting
│   ├── session-manager.ts # Multi-session lifecycle, state persistence to disk, health monitor
│   └── process-spawner.ts # Spawn claude remote-control, stdin piping, stdout polling for URL
├── tests/
│   ├── bot.test.ts
│   ├── config.test.ts
│   ├── session-manager.test.ts
│   └── process-spawner.test.ts
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

---

### Task 1: Scaffold the project

**Files:**
- Create: `C:\Data\Repos\claude-remote-bot\package.json`
- Create: `C:\Data\Repos\claude-remote-bot\tsconfig.json`
- Create: `C:\Data\Repos\claude-remote-bot\.gitignore`

- [ ] **Step 1: Create the repo directory**

```bash
mkdir -p /c/Data/Repos/claude-remote-bot
cd /c/Data/Repos/claude-remote-bot
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "claude-remote-bot",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build --compile src/index.ts --outfile claude-remote-bot",
    "test": "bun test"
  },
  "dependencies": {
    "discord.js": "^14.16.3"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@types/bun"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
data/
claude-remote-bot
claude-remote-bot.exe
*.stdout
*.stderr
.env
```

- [ ] **Step 5: Install dependencies**

```bash
cd /c/Data/Repos/claude-remote-bot
bun install
```

Expected: `node_modules` created, lockfile generated.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb
git commit -m "chore: scaffold project with bun, discord.js, typescript"
```

---

### Task 2: Config module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_CHANNEL_ID;
    delete process.env.DISCORD_OWNER_ID;
    delete process.env.DATA_DIR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("loads config from environment variables", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    process.env.DISCORD_CHANNEL_ID = "123456";
    process.env.DISCORD_OWNER_ID = "789012";
    process.env.DATA_DIR = "/tmp/test-data";

    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();

    expect(config.discordToken).toBe("test-token");
    expect(config.channelId).toBe("123456");
    expect(config.ownerId).toBe("789012");
    expect(config.dataDir).toBe("/tmp/test-data");
  });

  test("uses default data dir when not specified", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    process.env.DISCORD_CHANNEL_ID = "123456";
    process.env.DISCORD_OWNER_ID = "789012";

    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();

    expect(config.dataDir).toContain("data");
  });

  test("throws when required env vars are missing", async () => {
    const { loadConfig } = await import("../src/config.ts");
    expect(() => loadConfig()).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Data/Repos/claude-remote-bot
bun test tests/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/config.ts
import { existsSync, readFileSync } from "fs";
import path from "path";

export interface Config {
  discordToken: string;
  channelId: string;
  ownerId: string;
  dataDir: string;
}

function loadConfigFile(): Partial<Config> {
  // Resolve config.json adjacent to the binary / entry script
  const binDir = path.dirname(process.argv[1] || process.execPath);
  const configPath = path.join(binDir, "config.json");

  if (!existsSync(configPath)) return {};

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      discordToken: raw.DISCORD_TOKEN,
      channelId: raw.DISCORD_CHANNEL_ID,
      ownerId: raw.DISCORD_OWNER_ID,
      dataDir: raw.DATA_DIR,
    };
  } catch {
    return {};
  }
}

export function loadConfig(): Config {
  const file = loadConfigFile();

  const discordToken = process.env.DISCORD_TOKEN || file.discordToken;
  const channelId = process.env.DISCORD_CHANNEL_ID || file.channelId;
  const ownerId = process.env.DISCORD_OWNER_ID || file.ownerId;
  const dataDir =
    process.env.DATA_DIR ||
    file.dataDir ||
    path.join(path.dirname(process.argv[1] || process.execPath), "data");

  const missing: string[] = [];
  if (!discordToken) missing.push("DISCORD_TOKEN");
  if (!channelId) missing.push("DISCORD_CHANNEL_ID");
  if (!ownerId) missing.push("DISCORD_OWNER_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(", ")}. ` +
        `Set via environment variables or config.json.`
    );
  }

  return { discordToken: discordToken!, channelId: channelId!, ownerId: ownerId!, dataDir };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/config.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config module with env var and config.json loading"
```

---

### Task 3: Process spawner module

**Files:**
- Create: `src/process-spawner.ts`
- Create: `tests/process-spawner.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/process-spawner.test.ts
import { describe, test, expect } from "bun:test";
import { buildSpawnArgs, URL_REGEX } from "../src/process-spawner.ts";

describe("process-spawner", () => {
  test("URL_REGEX matches claude.ai/code URLs", () => {
    const text = "Session URL: https://claude.ai/code/abc123-def456 ready";
    const match = text.match(URL_REGEX);
    expect(match).not.toBeNull();
    expect(match![0]).toBe("https://claude.ai/code/abc123-def456");
  });

  test("URL_REGEX does not match non-claude URLs", () => {
    const text = "Visit https://example.com/code/abc";
    expect(text.match(URL_REGEX)).toBeNull();
  });

  test("buildSpawnArgs returns correct arguments", () => {
    const args = buildSpawnArgs("MyProject");
    expect(args).toEqual([
      "remote-control",
      "--name",
      "MyProject",
      "--permission-mode",
      "bypassPermissions",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/process-spawner.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/process-spawner.ts
import { spawn } from "child_process";
import { openSync, closeSync, readFileSync, mkdirSync, unlinkSync } from "fs";
import path from "path";

export const URL_REGEX = /https:\/\/claude\.ai\/code\S+/;
const URL_TIMEOUT_MS = 30_000;
const URL_POLL_MS = 200;

export interface SpawnResult {
  pid: number;
  url: string;
  stdoutFile: string;
  stderrFile: string;
}

export function buildSpawnArgs(name: string): string[] {
  return [
    "remote-control",
    "--name",
    name,
    "--permission-mode",
    "bypassPermissions",
  ];
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export { isProcessAlive };

export async function spawnSession(
  name: string,
  cwd: string,
  dataDir: string
): Promise<{ ok: true; result: SpawnResult } | { ok: false; error: string }> {
  mkdirSync(dataDir, { recursive: true });

  const stdoutFile = path.join(dataDir, `${name}.stdout`);
  const stderrFile = path.join(dataDir, `${name}.stderr`);
  const stdoutFd = openSync(stdoutFile, "w");
  const stderrFd = openSync(stderrFile, "w");

  let proc;
  try {
    proc = spawn("claude", buildSpawnArgs(name), {
      cwd,
      stdio: ["pipe", stdoutFd, stderrFd],
      detached: true,
      windowsHide: true,
    } as any);
  } catch (err: any) {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    return { ok: false, error: `Failed to start: ${err.message}` };
  }

  // Auto-accept "Enable Remote Control?" prompt
  if (proc.stdin) {
    proc.stdin.write("y\n");
    proc.stdin.end();
  }

  closeSync(stdoutFd);
  closeSync(stderrFd);
  proc.unref();

  const pid = proc.pid;
  if (!pid) {
    return { ok: false, error: "Failed to get process PID" };
  }

  // Poll stdout file for the URL
  return new Promise((resolve) => {
    const startTime = Date.now();

    const poll = () => {
      if (!isProcessAlive(pid)) {
        resolve({ ok: false, error: "Process exited before producing URL" });
        return;
      }

      let content = "";
      try {
        content = readFileSync(stdoutFile, "utf-8");
      } catch {
        // File may not have content yet
      }

      const match = content.match(URL_REGEX);
      if (match) {
        resolve({
          ok: true,
          result: { pid, url: match[0], stdoutFile, stderrFile },
        });
        return;
      }

      if (Date.now() - startTime >= URL_TIMEOUT_MS) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already dead
        }
        resolve({ ok: false, error: "Timed out waiting for Remote Control URL" });
        return;
      }

      setTimeout(poll, URL_POLL_MS);
    };

    poll();
  });
}

export function killProcess(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already dead
  }
}

export function cleanupLogFiles(stdoutFile: string, stderrFile: string): void {
  try { unlinkSync(stdoutFile); } catch { /* ignore */ }
  try { unlinkSync(stderrFile); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/process-spawner.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/process-spawner.ts tests/process-spawner.test.ts
git commit -m "feat: add process spawner for claude remote-control sessions"
```

---

### Task 4: Session manager module

**Files:**
- Create: `src/session-manager.ts`
- Create: `tests/session-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/session-manager.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import path from "path";
import os from "os";
import { SessionManager } from "../src/session-manager.ts";

describe("SessionManager", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "crb-test-"));
    manager = new SessionManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("deriveName extracts basename from path", () => {
    expect(manager.deriveName("/home/user/projects/Flashpad")).toBe("Flashpad");
    expect(manager.deriveName("C:\\Data\\Repos\\Flashpad")).toBe("Flashpad");
  });

  test("deriveName appends suffix on collision", () => {
    // Simulate an active session named "Flashpad"
    manager._addSessionForTesting({
      name: "Flashpad",
      pid: 99999,
      url: "https://claude.ai/code/test",
      cwd: "/tmp/test",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test.stdout",
      stderrFile: "/tmp/test.stderr",
    });

    expect(manager.deriveName("/some/path/Flashpad")).toBe("Flashpad-2");
  });

  test("deriveName finds lowest unused suffix", () => {
    manager._addSessionForTesting({
      name: "Flashpad",
      pid: 99999,
      url: "https://claude.ai/code/test1",
      cwd: "/tmp/test1",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test1.stdout",
      stderrFile: "/tmp/test1.stderr",
    });
    manager._addSessionForTesting({
      name: "Flashpad-3",
      pid: 99998,
      url: "https://claude.ai/code/test3",
      cwd: "/tmp/test3",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test3.stdout",
      stderrFile: "/tmp/test3.stderr",
    });

    // Should pick Flashpad-2 (lowest unused), not Flashpad-4
    expect(manager.deriveName("/some/path/Flashpad")).toBe("Flashpad-2");
  });

  test("list returns empty array initially", () => {
    expect(manager.list()).toEqual([]);
  });

  test("findByName is case-insensitive", () => {
    manager._addSessionForTesting({
      name: "Flashpad",
      pid: 99999,
      url: "https://claude.ai/code/test",
      cwd: "/tmp/test",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test.stdout",
      stderrFile: "/tmp/test.stderr",
    });

    expect(manager.findByName("flashpad")).not.toBeNull();
    expect(manager.findByName("FLASHPAD")).not.toBeNull();
    expect(manager.findByName("nonexistent")).toBeNull();
  });

  test("remove deletes session and persists state", () => {
    manager._addSessionForTesting({
      name: "Flashpad",
      pid: 99999,
      url: "https://claude.ai/code/test",
      cwd: "/tmp/test",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test.stdout",
      stderrFile: "/tmp/test.stderr",
    });

    manager.remove("Flashpad");
    expect(manager.list()).toEqual([]);
  });

  test("state persists to and restores from disk", () => {
    // Use process.pid (known alive) so restore() keeps the session
    manager._addSessionForTesting({
      name: "Flashpad",
      pid: process.pid,
      url: "https://claude.ai/code/test",
      cwd: "/tmp/test",
      startedAt: new Date().toISOString(),
      stdoutFile: "/tmp/test.stdout",
      stderrFile: "/tmp/test.stderr",
    });

    // Create a new manager from the same directory — should restore state
    const manager2 = new SessionManager(tmpDir);
    manager2.restore();
    expect(manager2.list().length).toBe(1);
    expect(manager2.list()[0].name).toBe("Flashpad");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/session-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/session-manager.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { spawnSession, killProcess, isProcessAlive, cleanupLogFiles } from "./process-spawner.ts";

export interface Session {
  name: string;
  pid: number;
  url: string;
  cwd: string;
  startedAt: string;
  stdoutFile: string;
  stderrFile: string;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;
  private stateFile: string;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, "sessions.json");
    mkdirSync(dataDir, { recursive: true });
  }

  deriveName(dirPath: string): string {
    const base = path.basename(dirPath);
    if (!this.sessions.has(base.toLowerCase())) return base;

    let suffix = 2;
    while (this.sessions.has(`${base}-${suffix}`.toLowerCase())) {
      suffix++;
    }
    return `${base}-${suffix}`;
  }

  async start(
    dirPath: string
  ): Promise<{ ok: true; name: string; url: string } | { ok: false; error: string }> {
    if (!existsSync(dirPath)) {
      return { ok: false, error: `Directory not found: ${dirPath}` };
    }

    const name = this.deriveName(dirPath);
    const result = await spawnSession(name, dirPath, this.dataDir);

    if (!result.ok) return result;

    const session: Session = {
      name,
      pid: result.result.pid,
      url: result.result.url,
      cwd: dirPath,
      startedAt: new Date().toISOString(),
      stdoutFile: result.result.stdoutFile,
      stderrFile: result.result.stderrFile,
    };

    this.sessions.set(name.toLowerCase(), session);
    this.saveState();
    return { ok: true, name, url: session.url };
  }

  stop(name: string): { ok: true; name: string } | { ok: false; error: string } {
    const session = this.findByName(name);
    if (!session) {
      return { ok: false, error: `No session named **${name}**. Use \`!remote list\` to see active sessions.` };
    }

    killProcess(session.pid);
    cleanupLogFiles(session.stdoutFile, session.stderrFile);
    this.sessions.delete(session.name.toLowerCase());
    this.saveState();
    return { ok: true, name: session.name };
  }

  stopAll(): string[] {
    const stopped: string[] = [];
    for (const session of this.sessions.values()) {
      killProcess(session.pid);
      cleanupLogFiles(session.stdoutFile, session.stderrFile);
      stopped.push(session.name);
    }
    this.sessions.clear();
    this.saveState();
    return stopped;
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  findByName(name: string): Session | null {
    return this.sessions.get(name.toLowerCase()) || null;
  }

  remove(name: string): void {
    this.sessions.delete(name.toLowerCase());
    this.saveState();
  }

  /** Restore sessions from disk. Returns names of dead sessions that were cleaned up. */
  restore(): string[] {
    if (!existsSync(this.stateFile)) return [];

    try {
      const data: Session[] = JSON.parse(readFileSync(this.stateFile, "utf-8"));
      const dead: string[] = [];

      for (const session of data) {
        if (isProcessAlive(session.pid)) {
          this.sessions.set(session.name.toLowerCase(), session);
        } else {
          cleanupLogFiles(session.stdoutFile, session.stderrFile);
          dead.push(session.name);
        }
      }

      this.saveState();
      return dead;
    } catch {
      return [];
    }
  }

  /** Check all sessions for liveness. Returns names of sessions that died. */
  healthCheck(): string[] {
    const dead: string[] = [];

    for (const [key, session] of this.sessions) {
      if (!isProcessAlive(session.pid)) {
        cleanupLogFiles(session.stdoutFile, session.stderrFile);
        this.sessions.delete(key);
        dead.push(session.name);
      }
    }

    if (dead.length > 0) this.saveState();
    return dead;
  }

  startHealthMonitor(onDead: (names: string[]) => void, intervalMs = 30_000): void {
    this.healthInterval = setInterval(() => {
      const dead = this.healthCheck();
      if (dead.length > 0) onDead(dead);
    }, intervalMs);
  }

  stopHealthMonitor(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  /** @internal — for testing only */
  _addSessionForTesting(session: Session): void {
    this.sessions.set(session.name.toLowerCase(), session);
    this.saveState();
  }

  private saveState(): void {
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(Array.from(this.sessions.values()), null, 2));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/session-manager.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session-manager.ts tests/session-manager.test.ts
git commit -m "feat: add session manager with multi-session lifecycle and persistence"
```

---

### Task 5: Discord bot module

**Files:**
- Create: `src/bot.ts`
- Create: `tests/bot.test.ts`

- [ ] **Step 1: Write failing tests for the pure functions**

```typescript
// tests/bot.test.ts
import { describe, test, expect } from "bun:test";
import { parseCommand, formatUptime } from "../src/bot.ts";

describe("parseCommand", () => {
  test("parses start with path", () => {
    expect(parseCommand("!remote start /home/user/project")).toEqual({
      action: "start",
      arg: "/home/user/project",
    });
  });

  test("start captures everything after 'start ' (paths with spaces)", () => {
    expect(parseCommand("!remote start C:\\My Projects\\Flashpad")).toEqual({
      action: "start",
      arg: "C:\\My Projects\\Flashpad",
    });
  });

  test("start with no arg returns start action without arg", () => {
    expect(parseCommand("!remote start")).toEqual({ action: "start" });
  });

  test("parses stop with name", () => {
    expect(parseCommand("!remote stop Flashpad")).toEqual({
      action: "stop",
      arg: "Flashpad",
    });
  });

  test("parses stop-all", () => {
    expect(parseCommand("!remote stop-all")).toEqual({ action: "stop-all" });
  });

  test("parses stop-all with trailing space", () => {
    expect(parseCommand("!remote stop-all ")).toEqual({ action: "stop-all" });
  });

  test("parses list", () => {
    expect(parseCommand("!remote list")).toEqual({ action: "list" });
  });

  test("parses status as list alias", () => {
    expect(parseCommand("!remote status")).toEqual({ action: "list" });
  });

  test("returns null for unknown command", () => {
    expect(parseCommand("!remote foobar")).toBeNull();
  });

  test("returns null for non-remote message", () => {
    expect(parseCommand("hello world")).toBeNull();
  });
});

describe("formatUptime", () => {
  test("formats minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatUptime(fiveMinAgo)).toBe("5m");
  });

  test("formats hours and minutes", () => {
    const twoHoursAgo = new Date(Date.now() - 125 * 60_000).toISOString();
    expect(formatUptime(twoHoursAgo)).toBe("2h 5m");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/bot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Export `parseCommand` and `formatUptime` so they can be tested. The Discord integration is glue — tested via manual integration in Task 7.

```typescript
// src/bot.ts
import { Client, GatewayIntentBits, type Message } from "discord.js";
import type { Config } from "./config.ts";
import type { SessionManager } from "./session-manager.ts";

interface Command {
  action: "start" | "stop" | "stop-all" | "list";
  arg?: string;
}

export function parseCommand(content: string): Command | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("!remote")) return null;

  const afterPrefix = trimmed.slice("!remote".length).trim();

  if (afterPrefix.startsWith("start ")) {
    const arg = afterPrefix.slice("start ".length).trim();
    if (!arg) return null; // handled as missing arg
    return { action: "start", arg };
  }
  if (afterPrefix === "start") return { action: "start" }; // missing arg
  if (afterPrefix.trimEnd() === "stop-all") {
    return { action: "stop-all" };
  }
  if (afterPrefix.startsWith("stop ")) {
    const arg = afterPrefix.slice("stop ".length).trim();
    if (!arg) return { action: "stop" };
    return { action: "stop", arg };
  }
  if (afterPrefix === "stop") return { action: "stop" }; // missing arg
  if (afterPrefix === "list" || afterPrefix === "status") return { action: "list" };

  return null;
}

export function formatUptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}

const USAGE =
  "Usage: `!remote start <path>` | `!remote stop <name>` | `!remote stop-all` | `!remote list`";

export function createBot(config: Config, sessionManager: SessionManager) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  async function handleMessage(message: Message): Promise<void> {
    // Filter: only our owner, only our channel, ignore bots
    if (message.author.bot) return;
    if (message.author.id !== config.ownerId) return;
    if (message.channelId !== config.channelId) return;

    const content = message.content.trim();
    if (!content.startsWith("!remote")) return;

    const command = parseCommand(content);

    if (!command) {
      await message.reply(USAGE);
      return;
    }

    switch (command.action) {
      case "start": {
        if (!command.arg) {
          await message.reply("Usage: `!remote start <path>`");
          return;
        }
        await message.reply("Starting session...");
        const result = await sessionManager.start(command.arg);
        if (result.ok) {
          await message.reply(`**${result.name}** started\n\`${result.url}\``);
        } else {
          await message.reply(`Failed to start session: ${result.error}`);
        }
        break;
      }

      case "stop": {
        if (!command.arg) {
          await message.reply("Usage: `!remote stop <name>`");
          return;
        }
        const result = sessionManager.stop(command.arg);
        if (result.ok) {
          await message.reply(`**${result.name}** session ended`);
        } else {
          await message.reply(result.error);
        }
        break;
      }

      case "stop-all": {
        const stopped = sessionManager.stopAll();
        if (stopped.length === 0) {
          await message.reply("No active sessions");
        } else {
          await message.reply(
            `Stopped ${stopped.length} session(s): ${stopped.map((n) => `**${n}**`).join(", ")}`
          );
        }
        break;
      }

      case "list": {
        const sessions = sessionManager.list();
        if (sessions.length === 0) {
          await message.reply("No active sessions");
          return;
        }
        const lines = sessions.map(
          (s) => `**${s.name}** — \`${s.url}\` — up ${formatUptime(s.startedAt)}`
        );
        await message.reply(
          `**Active Sessions (${sessions.length})**\n${lines.join("\n")}`
        );
        break;
      }
    }
  }

  client.on("messageCreate", (message) => {
    handleMessage(message).catch((err) => {
      console.error("Error handling message:", err);
    });
  });

  function postToChannel(text: string): void {
    const channel = client.channels.cache.get(config.channelId);
    if (channel && "send" in channel) {
      (channel as any).send(text).catch((err: any) =>
        console.error("Failed to post to channel:", err)
      );
    }
  }

  return {
    client,
    postToChannel,
    login: () => client.login(config.discordToken),
    destroy: () => client.destroy(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/bot.test.ts
```

Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts tests/bot.test.ts
git commit -m "feat: add Discord bot with command parsing and response formatting"
```

---

### Task 6: Entry point — wire everything together

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/index.ts
import { execSync } from "child_process";
import { loadConfig } from "./config.ts";
import { SessionManager } from "./session-manager.ts";
import { createBot } from "./bot.ts";

// Verify claude is on PATH
try {
  execSync("claude --version", { stdio: "pipe" });
} catch {
  console.error(
    "Error: 'claude' command not found on PATH.\n" +
      "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code\n" +
      "Then ensure 'claude' is available in your terminal."
  );
  process.exit(1);
}

const config = loadConfig();
const sessionManager = new SessionManager(config.dataDir);

// Restore sessions from previous run
const deadOnRestore = sessionManager.restore();
const liveCount = sessionManager.list().length;

const bot = createBot(config, sessionManager);

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  sessionManager.stopHealthMonitor();
  bot.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Connect to Discord
bot.client.on("ready", () => {
  console.log(`Logged in as ${bot.client.user?.tag}`);

  let statusMsg = `Bot online.`;
  if (liveCount > 0) {
    statusMsg += ` **${liveCount}** session(s) restored.`;
  }
  if (deadOnRestore.length > 0) {
    statusMsg += ` ${deadOnRestore.length} dead session(s) cleaned up.`;
  }
  if (liveCount === 0 && deadOnRestore.length === 0) {
    statusMsg += ` No active sessions.`;
  }

  bot.postToChannel(statusMsg);

  // Start health monitor after Discord is connected
  sessionManager.startHealthMonitor((deadNames) => {
    for (const name of deadNames) {
      bot.postToChannel(`**${name}** session ended unexpectedly`);
    }
  });
});

await bot.login();
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Data/Repos/claude-remote-bot
bun build --compile src/index.ts --outfile claude-remote-bot 2>&1
```

Expected: Binary produced (may warn about discord.js internals — that's OK).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point wiring config, session manager, and discord bot"
```

---

### Task 7: Integration test and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# Claude Remote Bot

A standalone Discord bot that spawns and manages Claude Code remote sessions on your machine. Request sessions from Discord, get a URL, connect via the Claude app.

## Prerequisites

- [Bun](https://bun.sh) (for development) or use the compiled binary
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and on PATH
- A Discord bot token ([create one here](https://discord.com/developers/applications))

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to Bot → create a bot
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Copy the bot token
6. Go to OAuth2 → URL Generator, select `bot` scope with `Send Messages` and `Read Message History` permissions
7. Use the generated URL to invite the bot to your server

## Configuration

Set environment variables or create a `config.json` next to the binary:

**Environment variables:**
```bash
export DISCORD_TOKEN="your-bot-token"
export DISCORD_CHANNEL_ID="your-channel-id"
export DISCORD_OWNER_ID="your-discord-user-id"
export DATA_DIR="./data"  # optional, defaults to ./data
```

**config.json:**
```json
{
  "DISCORD_TOKEN": "your-bot-token",
  "DISCORD_CHANNEL_ID": "your-channel-id",
  "DISCORD_OWNER_ID": "your-discord-user-id"
}
```

To find your Discord user ID: enable Developer Mode in Discord settings, then right-click your name → Copy User ID.

## Usage

```bash
# Run directly
bun run src/index.ts

# Or use the compiled binary
./claude-remote-bot
```

### Commands

| Command | Description |
|---------|-------------|
| `!remote start <path>` | Start a session in the given directory |
| `!remote stop <name>` | Stop a session by name |
| `!remote stop-all` | Stop all sessions |
| `!remote list` | Show active sessions |
| `!remote status` | Alias for list |

### Example

```
You:  !remote start C:\Data\Repos\Flashpad
Bot:  **Flashpad** started
      https://claude.ai/code/abc123

You:  !remote list
Bot:  **Active Sessions (1)**
      **Flashpad** — https://claude.ai/code/abc123 — up 12m

You:  !remote stop Flashpad
Bot:  **Flashpad** session ended
```

## Build

```bash
# Install dependencies
bun install

# Compile to single binary
bun build --compile src/index.ts --outfile claude-remote-bot

# Cross-compile
bun build --compile src/index.ts --target=bun-darwin-arm64 --outfile claude-remote-bot-macos
bun build --compile src/index.ts --target=bun-windows-x64 --outfile claude-remote-bot-windows.exe
```

## How It Works

- Sessions are spawned as **detached processes** — they survive bot restarts
- Session state is persisted to `data/sessions.json`
- A health monitor checks every 30s and notifies Discord if a session dies
- Only the configured owner in the configured channel can issue commands
```

- [ ] **Step 2: Manual integration test**

1. Set `DISCORD_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_OWNER_ID` environment variables
2. Run `bun run src/index.ts`
3. Verify bot comes online and posts startup message
4. Send `!remote list` — expect "No active sessions"
5. Send `!remote start <valid-path>` — expect URL returned
6. Send `!remote list` — expect session shown with uptime
7. Send `!remote stop <name>` — expect "session ended"
8. Send `!remote start <path>` twice with same directory — expect second session gets `-2` suffix
9. Send `!remote stop-all` — expect both stopped
10. Kill a session process manually (via task manager / `kill`) — expect death notification within 30s

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, usage, and build instructions"
```

---

### Task 8: Final build verification

- [ ] **Step 1: Run all tests**

```bash
cd /c/Data/Repos/claude-remote-bot
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Compile binary**

```bash
bun build --compile src/index.ts --outfile claude-remote-bot
```

Expected: Binary produced successfully.

- [ ] **Step 3: Verify binary runs**

```bash
./claude-remote-bot
```

Expected: Should exit with config error (no env vars set) — confirms binary executes and config validation works.

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final build verification and fixups"
```
