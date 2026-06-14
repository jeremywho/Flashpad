import { test, expect } from '@playwright/test';
import { getE2EState, E2EState } from './helpers/e2e-state';
import {
  launchApp,
  loginViaUi,
  listNoteFiles,
  readNoteFile,
  AppInstance,
} from './helpers/electron-app';

let state: E2EState;

test.beforeAll(async () => {
  state = getE2EState();
});

// ---------------------------------------------------------------------------
// Regression: typing in a brand-new note while its first autosave (createNote)
// is still in flight used to lose the text typed during the round-trip.
//
// On a fast local backend the round-trip window is too small to hit by typing
// speed alone, so we hold the POST /api/notes response open with page.route,
// type the "tail" while it is held, then release it. Without the fix the
// editor is reset to the saved snapshot on the new-note -> server-id transition
// and the tail disappears from the textarea.
// ---------------------------------------------------------------------------
test.describe('New note autosave does not drop in-flight typing', () => {
  let app: AppInstance;

  test.afterEach(async () => {
    await app?.stop();
  });

  test('keeps text typed while the first create round-trip is in flight', async () => {
    app = await launchApp({ apiUrl: state.baseUrl, deviceId: 'device-new-note-autosave' });
    await loginViaUi(app.page, state.username, state.password);
    const page = app.page;

    // Hold the first POST /api/notes (the new note's create) open until we
    // release it, simulating a slow round-trip. Later POSTs pass straight through.
    let releaseCreate!: () => void;
    const createReleased = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let createIntercepted = false;
    await page.route('**/api/notes**', async (route) => {
      if (route.request().method() === 'POST' && !createIntercepted) {
        createIntercepted = true;
        await createReleased;
      }
      await route.continue();
    });

    // Start a new note and type the first chunk.
    await page.click('button.notes-list-new-btn');
    const editor = page.locator('textarea.note-editor-content');
    await editor.waitFor({ state: 'visible', timeout: 5_000 });

    // Unique marker so the assertions ignore notes left on the shared e2e
    // account by other specs.
    const marker = `autosave-${Date.now()}`;
    const head = `Start ${marker}`;
    const tail = ` and the tail of ${marker} typed during the save`;
    await editor.click();
    await editor.pressSequentially(head);

    // Wait for the 1s autosave debounce to fire and the create POST to be held.
    await expect.poll(() => createIntercepted, { timeout: 10_000 }).toBe(true);

    // Keep typing while the create is still in flight — this is the text that
    // used to vanish.
    await editor.pressSequentially(tail);

    // Release the create and wait for its round-trip to finish. This is the
    // moment the new note gets its real server id — where the editor used to
    // reset to the stale saved snapshot and drop the tail. (The unfixed app
    // briefly drops it, then "recovers" ~1s later when the tail's own autosave
    // fires, so we must check during this window, not after.)
    const createResponse = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/notes(\?|$)/.test(r.url()),
      { timeout: 15_000 }
    );
    releaseCreate();
    await createResponse;
    await page.waitForTimeout(300); // let the new-note -> server-id transition render

    // The text typed during the round-trip must NOT have been dropped.
    expect(await editor.inputValue()).toBe(head + tail);

    // Let the trailing autosave settle, then confirm it persisted as exactly
    // one note — not lost, and not duplicated.
    await page.waitForTimeout(2_000);
    const matching = listNoteFiles(app.dataDir)
      .map((f) => readNoteFile(app.dataDir, f))
      .filter((c) => c.includes(marker));
    expect(matching.length).toBe(1);
    expect(matching[0]).toContain(head + tail);
  });
});
