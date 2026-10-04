import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab } from './helpers/app';

/**
 * Setlist import via URL (v1.43.0).
 *
 * Scoped to the UI surface on purpose. The outbound fetch, the SSRF guard and
 * the model call are all server-side and covered by test/ai-setlist-import.test.ts;
 * driving a real external fetch from E2E would make the suite depend on the
 * public internet and on setlist.fm being reachable.
 *
 * What is checked here is what a regression in the modal would break: that the
 * field renders, that it gates the button, and that its value actually reaches
 * the request body.
 */

test.describe('Setlist import via URL', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  async function openImportModal(tab: import('@playwright/test').Page) {
    const trigger = tab.getByTestId('setlist-import-open').first();
    test.skip((await trigger.count()) === 0, 'Setlist import trigger not available');
    await trigger.waitFor({ state: 'visible', timeout: 30_000 });
    await trigger.click();
    await expect(tab.getByTestId('setlist-import-url')).toBeVisible();
    // Scope to the sheet: the setlist page behind it has its own textareas.
    return tab.getByRole('dialog');
  }

  test('the paste tab offers a URL field alongside the textarea', async ({ page }) => {
    const tab = await openAppTab(page, 'setlists');
    const dialog = await openImportModal(tab);

    await expect(tab.getByTestId('setlist-import-url')).toBeVisible();
    await expect(tab.getByTestId('setlist-import-url')).toHaveAttribute('type', 'url');
    // The label points at the service this was built for.
    await expect(tab.getByTestId('setlist-import-url')).toHaveAttribute(
      'placeholder',
      /setlist\.fm/i
    );

    // URL is an addition, not a replacement: pasted text still works.
    await expect(dialog.locator('textarea')).toBeVisible();
    await tab.close();
  });

  test('the analyse button enables for a pasted link alone', async ({ page }) => {
    const tab = await openAppTab(page, 'setlists');
    await openImportModal(tab);

    const analyse = tab.getByRole('button', { name: /analyseren|analyse/i }).first();
    // Nothing to work from yet.
    await expect(analyse).toBeDisabled();

    await tab.getByTestId('setlist-import-url').fill('https://www.setlist.fm/setlist/a/1');
    await expect(analyse).toBeEnabled();
    await tab.close();
  });

  test('the URL is sent to the parse endpoint', async ({ page }) => {
    const tab = await openAppTab(page, 'setlists');
    await openImportModal(tab);

    // Stub the endpoint so no outbound request is made from the test.
    const bodies: string[] = [];
    await tab.route('**/api/setlists/parse', async (route) => {
      const post = route.request().postData();
      if (post) bodies.push(post);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], rawText: '', ocrUsed: false }),
      });
    });

    await tab.getByTestId('setlist-import-url').fill('https://www.setlist.fm/setlist/a/1');
    await tab.getByRole('button', { name: /analyseren|analyse/i }).first().click();

    await expect.poll(() => bodies.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const sent = JSON.parse(bodies[0]) as { url?: string };
    expect(sent.url).toBe('https://www.setlist.fm/setlist/a/1');
    await tab.close();
  });
});