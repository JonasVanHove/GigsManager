import { test, expect } from '@playwright/test';
import {
  MOBILE,
  TABLET,
  DESKTOP,
  openAppTab,
  horizontalOverflow,
} from './helpers/app';

/**
 * Responsive layout of the dashboard and the setlists tab.
 *
 * v1.36.0: this signed in by loading `/` (the marketing page) and clicking a
 * "Setlists" button that only exists inside the dashboard, so beforeEach always
 * timed out. It also referenced `setlists-grid` and `setlist-songs`, which are
 * not test ids the component has. The mobile-menu test ids do exist, so those
 * checks are kept and now actually run.
 */

test.describe('Responsive Layout', () => {
  test.describe.configure({ timeout: 90_000 });

  async function openSetlists(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'setlists');
    await tab.getByTestId('setlists-container').waitFor({ state: 'visible', timeout: 60_000 });
    return tab;
  }

  test('should display correctly on mobile (375x667)', async ({ page }) => {
    const tab = await openSetlists(page);
    await tab.setViewportSize(MOBILE);

    await expect(tab.getByTestId('mobile-menu-button')).toBeVisible();
    // The desktop tab strip is hidden behind the menu button at this width.
    await expect(tab.getByTestId('desktop-navigation')).toBeHidden();
    // The setlist list collapses at this width, but the shell must not overflow.
    await expect(tab.getByTestId('setlists-container')).toBeVisible();
    expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);
    await tab.close();
  });

  test('should display correctly on tablet (768x1024)', async ({ page }) => {
    const tab = await openSetlists(page);
    await tab.setViewportSize(TABLET);

    await expect(tab.getByTestId('setlists-container')).toBeVisible();
    expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);
    await tab.close();
  });

  test('should display correctly on desktop (1920x1080)', async ({ page }) => {
    const tab = await openSetlists(page);
    await tab.setViewportSize(DESKTOP);

    await expect(tab.getByTestId('desktop-navigation')).toBeVisible();
    await expect(tab.getByTestId('mobile-menu-button')).toBeHidden();
    await tab.close();
  });

  test('should handle mobile menu toggle', async ({ page }) => {
    const tab = await openSetlists(page);
    await tab.setViewportSize(MOBILE);

    await expect(tab.getByTestId('mobile-menu-overlay')).toBeHidden();

    await tab.getByTestId('mobile-menu-button').click();
    await expect(tab.getByTestId('mobile-menu-overlay')).toBeVisible({ timeout: 15_000 });

    await tab.getByTestId('close-mobile-menu').click();
    await expect(tab.getByTestId('mobile-menu-overlay')).toBeHidden();
    await tab.close();
  });

  test('should give every interactive control a hit target', async ({ page }) => {
    const tab = await openSetlists(page);

    const controls = tab.locator('button:visible, a:visible');
    const count = Math.min(await controls.count(), 25);
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await controls.nth(i).boundingBox();
      // A zero-sized control is unclickable regardless of how it looks.
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
    await tab.close();
  });

  test('should stack songs vertically on mobile', async ({ page }) => {
    // Open at desktop width first: the list collapses on mobile, so there is
    // nothing to click there. The resize afterwards is only measured, never
    // clicked on, so the "element is not stable" race does not apply.
    const tab = await openSetlists(page);
    await tab.setViewportSize(DESKTOP);
    await tab.getByTestId('setlist-item').first().waitFor({ state: 'visible', timeout: 30_000 });

    await tab.getByTestId('setlist-item').first().click();
    await tab.getByTestId('setlist-details').waitFor({ state: 'visible', timeout: 30_000 });

    const songs = tab.getByTestId('setlist-song-item');
    test.skip((await songs.count()) < 2, 'Setlist needs at least two songs');

    await tab.setViewportSize(MOBILE);
    await tab.waitForTimeout(500);

    const firstBox = await songs.nth(0).boundingBox();
    const secondBox = await songs.nth(1).boundingBox();
    if (firstBox && secondBox) {
      // One column: the second song sits below the first, not beside it.
      expect(secondBox.y).toBeGreaterThan(firstBox.y);
    }
    await tab.close();
  });

  test('should use more horizontal space on desktop', async ({ page }) => {
    const tab = await openSetlists(page);
    await tab.setViewportSize(DESKTOP);
    await tab.getByTestId('setlist-item').first().waitFor({ state: 'visible', timeout: 30_000 });

    await tab.getByTestId('setlist-item').first().click();
    await tab.getByTestId('setlist-details').waitFor({ state: 'visible', timeout: 30_000 });

    const detailsBox = await tab.getByTestId('setlist-details').boundingBox();
    expect(detailsBox).not.toBeNull();
    // The detail panel is a two-column layout at this width.
    expect(detailsBox!.width).toBeGreaterThan(500);
    await tab.close();
  });

  test('should handle orientation change without horizontal scroll', async ({ page }) => {
    const tab = await openSetlists(page);

    await tab.setViewportSize(MOBILE);
    await tab.waitForTimeout(300);
    expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);

    await tab.setViewportSize({ width: 667, height: 375 });
    await tab.waitForTimeout(300);
    expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);
    await expect(tab.getByTestId('setlists-container')).toBeVisible();
    await tab.close();
  });

  test('should not have horizontal scroll on any breakpoint', async ({ page }) => {
    const tab = await openSetlists(page);

    for (const viewport of [MOBILE, TABLET, { width: 1024, height: 768 }, DESKTOP]) {
      await tab.setViewportSize(viewport);
      await tab.waitForTimeout(300);
      expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);
    }
    await tab.close();
  });
});
