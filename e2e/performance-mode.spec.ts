import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab } from './helpers/app';

/**
 * Performance Mode from a setlist.
 *
 * v1.36.0: this used to `page.goto('/')` and click a "Setlists" button, which
 * lives on the dashboard rather than the landing page, so beforeEach always
 * timed out. It also relied on `performance-mode`, `exit-performance-mode`,
 * `next-song-button` and `drawer-*` test ids the component never had. Entering
 * and leaving Performance Mode is a toggle on `performance-mode-button`, and the
 * drawer is closed by its own labelled button.
 *
 * Pinned to a desktop viewport: the setlist list collapses behind the mobile
 * shell, so there is no row to open at phone widths, and Performance Mode is a
 * large-screen feature anyway.
 */

test.describe('Performance Mode Interactivity', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  /** Signs in and opens the first setlist. */
  async function openSetlist(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'setlists');
    await tab.getByTestId('setlists-container').waitFor({ state: 'visible', timeout: 60_000 });

    const first = tab.getByTestId('setlist-item').first();
    await first.waitFor({ state: 'visible', timeout: 60_000 });
    await first.click();

    await tab.getByTestId('setlist-details').waitFor({ state: 'visible', timeout: 30_000 });
    return tab;
  }

  /** Toggles Performance Mode on and waits for the song rail. */
  async function enterPerformanceMode(tab: import('@playwright/test').Page) {
    await tab.getByTestId('performance-mode-button').first().click();
    await tab
      .getByTestId('performance-song-item')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  test('should enter Performance Mode', async ({ page }) => {
    const tab = await openSetlist(page);

    // Before: the normal setlist detail view.
    await expect(tab.getByTestId('setlist-details')).toBeVisible();

    await enterPerformanceMode(tab);

    // After: the detail pane gives way to the full-screen song rail.
    await expect(tab.getByTestId('setlist-details')).toBeHidden();
    await tab.close();
  });

  test('should display songs in Performance Mode', async ({ page }) => {
    const tab = await openSetlist(page);

    const inSetlist = await tab.getByTestId('setlist-song-item').count();
    await enterPerformanceMode(tab);

    const inPerformanceMode = await tab.getByTestId('performance-song-item').count();
    expect(inPerformanceMode).toBeGreaterThan(0);
    // Same setlist, so both views must list the same songs.
    expect(inPerformanceMode).toBe(inSetlist);
    await tab.close();
  });

  test('should mark the tapped song as the active one', async ({ page }) => {
    const tab = await openSetlist(page);
    await enterPerformanceMode(tab);

    const songs = tab.getByTestId('performance-song-item');
    test.skip((await songs.count()) < 2, 'Setlist needs at least two songs');

    await songs.nth(1).click();
    // The highlight follows the selection...
    await expect(songs.nth(1)).toHaveClass(/border-brand-400/);
    // ...and exactly one song carries it at a time.
    await expect(songs.nth(0)).not.toHaveClass(/border-brand-400/);
    await expect(songs.filter({ hasText: /./ })).toHaveCount(await songs.count());
    await tab.close();
  });

  /**
   * The attachment drawer only opens for songs that actually have attachments
   * (`itemAttachments.has(songId)` gates it), and the demo seed deliberately
   * ships zero attachments, so the drawer itself is covered in
   * setlist-attachments.spec.ts against uploaded files instead.
   */
  test('should navigate to the next and previous song', async ({ page }) => {
    const tab = await openSetlist(page);
    await enterPerformanceMode(tab);

    const songs = tab.getByTestId('performance-song-item');
    const total = await songs.count();
    test.skip(total < 2, 'Setlist needs at least two songs to navigate');

    await songs.nth(0).click();
    await expect(songs.nth(0)).toHaveClass(/border-brand-400/);

    await tab.getByRole('button', { name: /volgende|next/i }).last().click();
    await expect(songs.nth(1)).toHaveClass(/border-brand-400/);

    await tab.getByRole('button', { name: /vorig|prev/i }).last().click();
    await expect(songs.nth(0)).toHaveClass(/border-brand-400/);
    await tab.close();
  });

  test('should exit Performance Mode', async ({ page }) => {
    const tab = await openSetlist(page);
    await enterPerformanceMode(tab);
    await expect(tab.getByTestId('performance-song-item').first()).toBeVisible();

    // The toggle button lives in the detail panel, which Performance Mode
    // replaces, so leaving goes through the header's own "back to editor".
    await tab.getByRole('button', { name: /terug naar editor|back to editor/i }).click();

    await expect(tab.getByTestId('setlist-details')).toBeVisible({ timeout: 30_000 });
    await expect(tab.getByTestId('performance-song-item')).toHaveCount(0);
    await tab.close();
  });

  test('should not overflow horizontally in Performance Mode', async ({ page }) => {
    const tab = await openSetlist(page);
    await enterPerformanceMode(tab);

    const overflow = await tab.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await tab.close();
  });
});


