import { test, expect } from '@playwright/test';
import { getE2EState, E2EState } from './helpers/e2e-state';
import { createNoteViaApi } from './helpers/auth';
import { launchApp, loginViaUi } from './helpers/electron-app';

let state: E2EState;

test.beforeAll(() => {
  state = getE2EState();
});

test('P1.2: external markdown links stay out of the Electron window', async () => {
  const app = await launchApp({ apiUrl: state.baseUrl, deviceId: `nav-${Date.now()}` });
  try {
    await loginViaUi(app.page, state.username, state.password);

    const title = `External navigation ${Date.now()}`;
    await createNoteViaApi(
      state.baseUrl,
      state.token,
      [
        title,
        '',
        '[Open example](https://example.com/flashpad-security-check)',
      ].join('\n')
    );

    const noteItem = app.page.locator('.notes-list-item').filter({ hasText: title }).first();
    await noteItem.waitFor({ state: 'visible', timeout: 20_000 });
    await noteItem.click();

    await app.page.locator('button:has-text("Preview")').click();

    const initialUrl = app.page.url();
    await app.page.locator('a[href="https://example.com/flashpad-security-check"]').click();
    await app.page.waitForTimeout(1000);

    expect(app.page.url()).toBe(initialUrl);
    expect(app.page.url()).toMatch(/^(file:|http:\/\/localhost|http:\/\/127\.0\.0\.1)/);
  } finally {
    await app.stop();
  }
});
