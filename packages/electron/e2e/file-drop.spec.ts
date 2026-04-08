import { test, expect } from '@playwright/test';
import { getE2EState, E2EState } from './helpers/e2e-state';
import { createCategoryViaApi } from './helpers/auth';
import {
  launchApp,
  loginViaUi,
  dropNoteFile,
  deleteNoteFile,
  listNoteFiles,
  readNoteFile,
} from './helpers/electron-app';

let state: E2EState;

test.beforeAll(async () => {
  state = getE2EState();
});

// Each test launches its own Electron app and restarts the backend afterward
// because the .NET backend suffers thread starvation after a SignalR WebSocket
// connection is established and then terminated.

test('L1: Plain .md file dropped into notes dir appears in UI and syncs', async () => {
  const app = await launchApp({ apiUrl: state.baseUrl, deviceId: `l1-${Date.now()}` });
  try {
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(3000);

    dropNoteFile(app.dataDir, 'external-plain.md', '# Dropped Note\n\nThis was dropped externally.');
    await app.page.waitForTimeout(10_000);

    const files = listNoteFiles(app.dataDir);
    expect(files.some((f) => f === 'external-plain.md')).toBe(false);
    expect(files.length).toBeGreaterThan(0);

    const matchingFile = files.find((f) => readNoteFile(app.dataDir, f).includes('This was dropped externally'));
    expect(matchingFile).toBeDefined();
  } finally {
    await app.stop();

  }
});

test('L2: .md with frontmatter and categoryId appears in correct category', async () => {
  // Create category before launching Electron (backend is fresh after restart)
  const category = await createCategoryViaApi(state.baseUrl, state.token, `YT Summaries ${Date.now()}`, '#ff6600');

  const app = await launchApp({ apiUrl: state.baseUrl, deviceId: `l2-${Date.now()}` });
  try {
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(3000);

    const noteId = `local_${Date.now()}_testdrop`;
    const now = new Date().toISOString();
    const fileContent = [
      '---',
      `id: "${noteId}"`,
      `categoryId: "${category.id}"`,
      'status: 0',
      'version: 1',
      'deviceId: ""',
      `createdAt: "${now}"`,
      `updatedAt: "${now}"`,
      'isLocal: true',
      'serverId: null',
      '---',
      '# YouTube Summary: Test Video',
      '',
      'This is a test YouTube summary.',
    ].join('\n');

    dropNoteFile(app.dataDir, `${noteId}.md`, fileContent);
    await app.page.waitForTimeout(10_000);

    const files = listNoteFiles(app.dataDir);
    const matchingFile = files.find((f) => readNoteFile(app.dataDir, f).includes('YouTube Summary: Test Video'));
    expect(matchingFile).toBeDefined();

    if (matchingFile) {
      expect(readNoteFile(app.dataDir, matchingFile)).toContain(category.id);
    }
  } finally {
    await app.stop();

  }
});

test('L4: Editing existing .md file externally syncs changes', async () => {
  const app = await launchApp({ apiUrl: state.baseUrl, deviceId: `l4-${Date.now()}` });
  try {
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(3000);

    // Drop a note file with frontmatter
    const noteId = `local_${Date.now()}_editme`;
    const now = new Date().toISOString();
    dropNoteFile(app.dataDir, `${noteId}.md`, [
      '---', `id: "${noteId}"`, 'categoryId: null', 'status: 0', 'version: 1',
      'deviceId: ""', `createdAt: "${now}"`, `updatedAt: "${now}"`,
      'isLocal: true', 'serverId: null', '---', 'Original file content for edit test',
    ].join('\n'));
    await app.page.waitForTimeout(8000);

    let files = listNoteFiles(app.dataDir);
    const noteFile = files.find((f) => readNoteFile(app.dataDir, f).includes('Original file content for edit test'));
    expect(noteFile).toBeDefined();

    if (noteFile) {
      const content = readNoteFile(app.dataDir, noteFile);
      dropNoteFile(app.dataDir, noteFile, content.replace('Original file content for edit test', 'Externally edited content'));
      await app.page.waitForTimeout(10_000);

      files = listNoteFiles(app.dataDir);
      expect(files.find((f) => readNoteFile(app.dataDir, f).includes('Externally edited content'))).toBeDefined();
    }
  } finally {
    await app.stop();

  }
});

test('L7: Deleting .md file externally removes note', async () => {
  const app = await launchApp({ apiUrl: state.baseUrl, deviceId: `l7-${Date.now()}` });
  try {
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(3000);

    const noteId = `local_${Date.now()}_deleteme`;
    const now = new Date().toISOString();
    dropNoteFile(app.dataDir, `${noteId}.md`, [
      '---', `id: "${noteId}"`, 'categoryId: null', 'status: 0', 'version: 1',
      'deviceId: ""', `createdAt: "${now}"`, `updatedAt: "${now}"`,
      'isLocal: true', 'serverId: null', '---', 'Note to delete externally',
    ].join('\n'));
    await app.page.waitForTimeout(8000);

    const files = listNoteFiles(app.dataDir);
    const noteFile = files.find((f) => readNoteFile(app.dataDir, f).includes('Note to delete externally'));
    expect(noteFile).toBeDefined();

    if (noteFile) {
      deleteNoteFile(app.dataDir, noteFile);
      await app.page.waitForTimeout(10_000);

      const remaining = listNoteFiles(app.dataDir);
      expect(remaining.some((f) => readNoteFile(app.dataDir, f).includes('Note to delete externally'))).toBe(false);
    }
  } finally {
    await app.stop();

  }
});
