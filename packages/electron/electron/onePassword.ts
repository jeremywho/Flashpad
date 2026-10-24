import { execFile } from 'child_process';
import * as fsSync from 'fs';
import path from 'path';
import {
  extractCredentials,
  selectAppLogins,
  OnePasswordFillResult,
  OnePasswordItem,
  OnePasswordListItem,
} from '../src/services/onePasswordItems';

const VERSION_TIMEOUT_MS = 5_000;
// Windows Hello / Touch ID approval can sit on screen for a while.
const APPROVAL_TIMEOUT_MS = 120_000;

let resolvedBinary: Promise<string | null> | null = null;
let offeredItemIds = new Set<string>();

function candidateBinaries(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    return [
      'op.exe',
      ...(localAppData ? [path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'op.exe')] : []),
    ];
  }
  // GUI apps on macOS do not inherit the shell PATH.
  return ['op', '/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op'];
}

function runOp(binary: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const lastLine = String(stderr).trim().split(/\r?\n/).pop() ?? '';
        reject(new Error(lastLine.replace(/^\[ERROR\]\s*\S+\s+\S+\s*/, '') || error.message));
        return;
      }
      resolve(String(stdout));
    });
  });
}

async function findBinary(): Promise<string | null> {
  for (const candidate of candidateBinaries()) {
    if (path.isAbsolute(candidate) && !fsSync.existsSync(candidate)) continue;
    try {
      await runOp(candidate, ['--version'], VERSION_TIMEOUT_MS);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function getBinary(): Promise<string | null> {
  if (!resolvedBinary) {
    resolvedBinary = findBinary();
  }
  return resolvedBinary;
}

export async function isOnePasswordAvailable(): Promise<boolean> {
  return (await getBinary()) !== null;
}

async function readCredentials(binary: string, itemId: string): Promise<OnePasswordFillResult> {
  const item = JSON.parse(
    await runOp(binary, ['item', 'get', itemId, '--format', 'json', '--reveal'], APPROVAL_TIMEOUT_MS)
  ) as OnePasswordItem;
  const credentials = extractCredentials(item);
  if (!credentials) {
    return { status: 'error', message: 'That 1Password item has no username and password.' };
  }
  return { status: 'filled', credentials };
}

export async function fillFromOnePassword(appHost: string, itemId?: string): Promise<OnePasswordFillResult> {
  const binary = await getBinary();
  if (!binary) {
    return { status: 'error', message: '1Password CLI is not installed.' };
  }

  try {
    if (itemId !== undefined) {
      if (!offeredItemIds.has(itemId)) {
        return { status: 'error', message: 'Unknown 1Password item.' };
      }
      return await readCredentials(binary, itemId);
    }

    const items = JSON.parse(
      await runOp(binary, ['item', 'list', '--categories', 'Login', '--format', 'json'], APPROVAL_TIMEOUT_MS)
    ) as OnePasswordListItem[];
    const choices = selectAppLogins(items, appHost);
    offeredItemIds = new Set(choices.map((choice) => choice.id));

    if (choices.length === 0) return { status: 'not-found' };
    if (choices.length > 1) return { status: 'choose', choices };
    return await readCredentials(binary, choices[0].id);
  } catch (error) {
    return { status: 'error', message: (error as Error).message || '1Password did not respond.' };
  }
}
