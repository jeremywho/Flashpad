import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';

export interface BackendInstance {
  port: number;
  baseUrl: string;
  dbPath: string;
  /** Restart the backend (kill + respawn). Reuses same DB and port. */
  restart: () => Promise<void>;
  /** Stop the backend and clean up temp files. */
  stop: () => Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not determine port'));
      }
    });
  });
}

export async function startBackend(opts?: { port?: number }): Promise<BackendInstance> {
  const port = opts?.port ?? await getFreePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flashpad-e2e-'));
  const dbPath = path.join(tmpDir, 'flashpad-test.db');
  const electronRoot = path.resolve(__dirname, '../..');
  const backendDir = path.resolve(electronRoot, '../backend');

  let dotnetBin: string;
  try {
    const which = execSync('which dotnet', { encoding: 'utf-8' }).trim();
    dotnetBin = fs.realpathSync(which);
  } catch {
    dotnetBin = '/usr/local/share/dotnet/dotnet';
  }

  const dotnetDir = path.dirname(dotnetBin);
  const fullPath = [dotnetDir, '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH].filter(Boolean).join(':');

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PATH: fullPath,
    DOTNET_ROOT: process.env.DOTNET_ROOT || dotnetDir,
    HOME: process.env.HOME || os.homedir(),
    ASPNETCORE_URLS: `http://localhost:${port}`,
    ConnectionStrings__DefaultConnection: `Data Source=${dbPath}`,
    JwtSettings__SecretKey: 'dGVzdC1zZWNyZXQta2V5LWZvci1lMmUtdGVzdHMtMTIzNDU2Nzg5MA==',
    H4__Endpoint: `http://localhost:${port}`,
    H4__ApiKey: '',
  };

  const dllPath = path.join(backendDir, 'bin', 'Debug', 'net10.0', 'Flashpad.dll');
  const args = fs.existsSync(dllPath)
    ? ['exec', dllPath, '--urls', `http://localhost:${port}`]
    : ['run', '--no-build', '--no-launch-profile', '--urls', `http://localhost:${port}`];

  const baseUrl = `http://localhost:${port}`;
  let proc: ChildProcess;

  async function spawnBackend(): Promise<void> {
    proc = spawn(dotnetBin, args, { cwd: backendDir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      proc.on('error', (err) => reject(new Error(`Failed to spawn dotnet: ${err.message}`)));
      setTimeout(resolve, 500);
    });
    await waitForBackend(baseUrl, 30_000);
  }

  async function killProc(): Promise<void> {
    if (!proc) return;
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
      setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 3000);
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  // Initial start
  await spawnBackend();

  return {
    port,
    baseUrl,
    dbPath,
    restart: async () => {
      await killProc();
      await spawnBackend();
    },
    stop: async () => {
      await killProc();
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
    },
  };
}

async function waitForBackend(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'probe', password: 'probe' }),
        signal: AbortSignal.timeout(3000),
      });
      if (response.status > 0) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Backend did not start within ${timeoutMs}ms at ${baseUrl}`);
}
