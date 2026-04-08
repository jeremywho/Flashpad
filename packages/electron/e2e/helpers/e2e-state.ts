import * as fs from 'fs';
import * as path from 'path';

export interface E2EState {
  baseUrl: string;
  port: number;
  token: string;
  username: string;
  password: string;
}

const STATE_FILE = path.join(__dirname, '..', '.e2e-state.json');

export function getE2EState(): E2EState {
  const data = fs.readFileSync(STATE_FILE, 'utf-8');
  return JSON.parse(data);
}
