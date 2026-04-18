import { app, safeStorage } from 'electron';
import * as fsPromises from 'fs/promises';
import path from 'path';

const SESSION_FILENAME = 'auth-session.enc';

function getSessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILENAME);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const filePath = getSessionPath();
  try {
    const buf = await fsPromises.readFile(filePath);
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    await clearStoredRefreshToken();
    return null;
  }
}

export async function storeRefreshToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(token);
  const filePath = getSessionPath();
  await fsPromises.writeFile(filePath, encrypted, { mode: 0o600 });
}

export async function clearStoredRefreshToken(): Promise<void> {
  const filePath = getSessionPath();
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
