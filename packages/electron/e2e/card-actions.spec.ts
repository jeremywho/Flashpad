import { test, expect } from '@playwright/test';
import { getE2EState, E2EState } from './helpers/e2e-state';
import { createNoteViaApi } from './helpers/auth';
import { launchApp, loginViaUi, AppInstance } from './helpers/electron-app';

let state: E2EState;
test.beforeAll(async () => {
  state = getE2EState();
});

test.describe('Note card context menu + toolbar layout', () => {
  let app: AppInstance;
  test.afterEach(async () => {
    await app?.stop();
  });

  test('right-click a card -> Move to Trash removes it from the inbox list', async () => {
    const content = `Card menu test ${Date.now()}`;
    await createNoteViaApi(state.baseUrl, state.token, content);

    app = await launchApp({ apiUrl: state.baseUrl, deviceId: 'device-card-menu' });
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(5000); // initial sync

    const card = app.page.locator('.notes-list-item', { hasText: 'Card menu test' }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click({ button: 'right' });

    const trashItem = app.page.locator('.notes-list-context-menu-item', { hasText: 'Move to Trash' });
    await expect(trashItem).toBeVisible();
    await trashItem.click();

    await expect(
      app.page.locator('.notes-list-item', { hasText: 'Card menu test' })
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('editor action buttons render inside the left toolbar group', async () => {
    const content = `Toolbar layout test ${Date.now()}`;
    await createNoteViaApi(state.baseUrl, state.token, content);

    app = await launchApp({ apiUrl: state.baseUrl, deviceId: 'device-toolbar' });
    await loginViaUi(app.page, state.username, state.password);
    await app.page.waitForTimeout(5000);

    await app.page.locator('.notes-list-item', { hasText: 'Toolbar layout test' }).first().click();

    // The Move-to-Trash action button must live in the left group, not the right.
    const leftTrash = app.page.locator('.note-editor-toolbar-left button[title="Move to Trash"]');
    await expect(leftTrash).toBeVisible();
    const rightActions = app.page.locator('.note-editor-toolbar-right button');
    await expect(rightActions).toHaveCount(0);
  });
});
