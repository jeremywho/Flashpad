import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '.e2e-state.json');

async function globalTeardown() {
  const backend = (globalThis as Record<string, unknown>).__e2eBackend as { stop: () => Promise<void> } | undefined;
  if (backend) {
    await backend.stop();
  }

  // Clean up state file
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // May not exist
  }
}

export default globalTeardown;
