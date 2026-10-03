import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab } from './helpers/app';

/**
 * Setlist song attachments.
 *
 * v1.36.0: this opened `/` and clicked a "Setlists" button that only exists
 * inside the dashboard, so beforeEach timed out. It then waited for
 * `attachment-success`, `attachment-viewer` and `delete-attachment` test ids
 * that the component does not have — there is no upload toast to wait on, the
 * uploaded file simply appears in the attachment strip.
 *
 * Assertions are on what the component really renders. The upload tests clean
 * up after themselves so repeated runs do not pile attachments onto the demo
 * account.
 */

const FIXTURE = 'e2e/fixtures/test-attachment.pdf';

test.describe('Setlist Attachments', () => {
  test.describe.configure({ timeout: 90_000 });
  // The attachment strip lives inside an expanded song row, and the song list
  // itself collapses behind the mobile shell, so this flow is desktop-only.
  test.use({ viewport: DESKTOP });

  /** Opens the first setlist and returns the tab with the details panel open. */
  async function openSetlist(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'setlists');
    await tab.getByTestId('setlists-container').waitFor({ state: 'visible', timeout: 60_000 });

    const first = tab.getByTestId('setlist-item').first();
    await first.waitFor({ state: 'visible', timeout: 60_000 });
    await first.click();

    await tab.getByTestId('setlist-details').waitFor({ state: 'visible', timeout: 30_000 });

    // The attachment strip sits inside `{item.expanded && ...}`, so the first
    // song row has to be expanded with its 🔧 toggle before it appears.
    const song = tab.getByTestId('setlist-song-item').first();
    await song.waitFor({ state: 'visible', timeout: 30_000 });
    await song
      .locator('button[aria-label*="uitklappen" i], button[aria-label*="expand" i]')
      .first()
      .click();

    await tab
      .getByTestId('attach-file-button')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    return tab;
  }

  /** The file input lives inside the attach label, hidden behind the label styling. */
  function fileInput(tab: import('@playwright/test').Page) {
    return tab.getByTestId('attach-file-button').locator('input[type="file"]').first();
  }

  test('should render an attach control wired to a file input', async ({ page }) => {
    const tab = await openSetlist(page);

    const attach = tab.getByTestId('attach-file-button').first();
    await expect(attach).toBeVisible();

    const input = fileInput(tab);
    await expect(input).toHaveCount(1);
    // The input is visually replaced by the label, so it must not take up space.
    await expect(input).toBeHidden();
    await tab.close();
  });

  test('should upload a file and list it', async ({ page }) => {
    // Every project runs against the same demo account, so concurrent workers
    // would add and remove files in one shared attachment list and each would
    // see the other's counts. Exactly one project is allowed to mutate it.
    // Keyed on the project name rather than `browserName`, because the mobile
    // projects reuse the desktop browser type.
    test.skip(
      test.info().project.name !== 'chromium',
      'Single-writer: all projects share the demo account'
    );

    const tab = await openSetlist(page);

    const before = await tab.getByTestId('attachment-item').count();
    await fileInput(tab).setInputFiles(FIXTURE);

    // Upload goes to Supabase storage and back; give it room on a cold dev box.
    await expect(tab.getByTestId('attachment-item')).toHaveCount(before + 1, {
      timeout: 45_000,
    });

    // Leave the demo account as we found it. The delete control is `hidden`
    // until the thumbnail is hovered, which gives it a zero-size box, so a
    // real mouse click cannot land on it — dispatching the handler directly is
    // the only reliable way and still exercises the real request.
    const item = tab.getByTestId('attachment-item').last();
    await item.hover();
    await item.locator('button').first().dispatchEvent('click');

    await expect(tab.getByTestId('attachment-item')).toHaveCount(before, {
      timeout: 30_000,
    });
    await tab.close();
  });

  test('should keep the attachment count stable across a reload', async ({ page }) => {
    // Same single-writer rule as the upload test: this asserts an exact count,
    // which another project's upload would invalidate.
    test.skip(
      test.info().project.name !== 'chromium',
      'Single-writer: all projects share the demo account'
    );

    const tab = await openSetlist(page);

    const before = await tab.getByTestId('attachment-item').count();
    await tab.reload();
    await tab.getByTestId('setlists-container').waitFor({ state: 'visible', timeout: 60_000 });
    await tab.getByTestId('setlist-item').first().click();
    await tab.getByTestId('setlist-details').waitFor({ state: 'visible', timeout: 30_000 });

    // Count comes back from the server, not from client state.
    await expect(tab.getByTestId('attachment-item')).toHaveCount(before);
    await tab.close();
  });
});

