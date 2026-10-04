import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab, waitForGigCards } from './helpers/app';

/**
 * Setlist print export (v1.39.0): the dropdown on a gig card, its print-option
 * toggles, and the sheet that lands in the print frame.
 *
 * The generator writes into a hidden iframe and calls print(). Headless browsers
 * treat print() as a no-op, so the assertions read the iframe's markup — which
 * is the actual artefact the user would save as a PDF.
 *
 * Desktop viewport only, for the same reason as Stage Mode: the gig card's
 * action row collapses on the mobile shell.
 */

test.describe('Setlist print export', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  async function openExportMenu(tab: import('@playwright/test').Page) {
    await waitForGigCards(tab);
    const trigger = tab.getByTestId('setlist-export-trigger').first();
    test.skip(
      (await trigger.count()) === 0,
      'No gig on the demo account has a setlist attached'
    );
    await trigger.waitFor({ state: 'visible', timeout: 30_000 });
    await trigger.click();
    await expect(tab.getByTestId('setlist-export-menu')).toBeVisible();
    return trigger;
  }

  test('opens the export dropdown with key and BPM toggles', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openExportMenu(tab);

    // Both default on: a band reading a music stand wants key and tempo.
    await expect(tab.getByTestId('export-toggle-key')).toBeChecked();
    await expect(tab.getByTestId('export-toggle-bpm')).toBeChecked();
    await expect(tab.getByTestId('export-stage-notes')).toBeVisible();

    // Both layouts are offered.
    await expect(tab.getByTestId('export-stage-sheet')).toBeVisible();
    await expect(tab.getByTestId('export-playbook')).toBeVisible();
    await tab.close();
  });

  test('closes the dropdown on Escape', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openExportMenu(tab);

    await tab.keyboard.press('Escape');
    await expect(tab.getByTestId('setlist-export-menu')).toBeHidden();
    await tab.close();
  });

  /**
   * Snapshot the printed sheet without racing the frame's teardown.
   *
   * `openPrintView` removes its iframe a second after calling print(), so
   * reading the live frame is a race. Instead the print dialog is stubbed out
   * and a MutationObserver keeps a copy of whatever gets written into any
   * iframe. The observer is test-only; production code is untouched.
   */
  async function capturePrintedSheet(tab: import('@playwright/test').Page) {
    await tab.evaluate(() => {
      const w = window as unknown as { __printed?: string };
      w.__printed = '';
      // Print dialogs cannot be automated; make print() a no-op.
      window.print = () => {};
      const snapshot = () => {
        document.querySelectorAll('iframe').forEach((f) => {
          try {
            const doc = f.contentDocument;
            if (doc?.documentElement?.outerHTML) w.__printed = doc.documentElement.outerHTML;
          } catch {
            /* cross-origin frame: nothing to read */
          }
        });
      };
      new MutationObserver(snapshot).observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  /** The HTML of the sheet that was printed, or '' if nothing was. */
  async function printedSheet(tab: import('@playwright/test').Page): Promise<string> {
    await expect
      .poll(
        async () => (await tab.evaluate(() => (window as unknown as { __printed?: string }).__printed)) ?? '',
        { timeout: 30_000 }
      )
      .not.toBe('');
    const full = await tab.evaluate(
      () => (window as unknown as { __printed?: string }).__printed ?? ''
    );
    // Markup only: the stylesheet legitimately defines .badge-key and .bpm.
    return full.replace(/<style>[\s\S]*?<\/style>/g, '');
  }

  test('prints the stage sheet with key and BPM shown', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openExportMenu(tab);
    await capturePrintedSheet(tab);

    await tab.getByTestId('export-stage-notes').fill('Hard out after the encore');
    await tab.getByTestId('export-stage-sheet').click();

    const sheet = await printedSheet(tab);
    expect(sheet).toContain('Stage setlist');
    expect(sheet).toContain('Hard out after the encore');

    // The demo account's attached setlist may be empty, so numbered rows are
    // asserted only when there are actually songs to number.
    const count = Number(sheet.match(/· (\d+) items?/)?.[1] ?? '0');
    if (count > 0) {
      expect(sheet).toMatch(/class="num">1</);
      expect(sheet).toContain('class="row');
    } else {
      expect(sheet).toContain('No songs on this setlist yet.');
    }
    await expect(tab.getByTestId('setlist-export-menu')).toBeHidden();
    await tab.close();
  });

  test('honours the key and BPM toggles', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openExportMenu(tab);
    await capturePrintedSheet(tab);

    await tab.getByTestId('export-toggle-key').uncheck();
    await tab.getByTestId('export-toggle-bpm').uncheck();
    await tab.getByTestId('export-stage-sheet').click();

    const sheet = await printedSheet(tab);
    // No key badge and no tempo survive when both switches are off, while the
    // songs themselves still print.
    expect(sheet).not.toContain('badge-key');
    expect(sheet).not.toContain('class="bpm"');
    expect(sheet).toContain('class="row');
    await tab.close();
  });

  test('prints the band and tech playbook', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openExportMenu(tab);
    await capturePrintedSheet(tab);

    await tab.getByTestId('export-playbook').click();

    const sheet = await printedSheet(tab);
    expect(sheet).toContain('tech playbook');
    // The set table is what tech actually reads: #, song, key, bpm, tuning, notes.
    expect(sheet).toContain('<th>Notes / arrangement</th>');
    expect(sheet).toContain('<tbody>');
    await tab.close();
  });
});
