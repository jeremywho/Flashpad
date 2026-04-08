import { startBackend } from './helpers/backend';
import { registerAndLogin } from './helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '.e2e-state.json');

async function globalSetup() {
  const backend = await startBackend({ port: 15000 });
  const auth = await registerAndLogin(backend.baseUrl);

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    baseUrl: backend.baseUrl,
    port: backend.port,
    dbPath: backend.dbPath,
    token: auth.token,
    username: auth.username,
    password: auth.password,
  }));

  (globalThis as Record<string, unknown>).__e2eBackend = backend;
}

export default globalSetup;
