import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab, waitForGigCards } from './helpers/app';

/**
 * Stage Mode (v1.38.0): entering the on-stage view from a gig card and moving
 * through the live setlist.
 *
 * Pinned to a desktop viewport because the gig card's action row — and the
 * setlist data behind it — is only reachable there; the mobile shell collapses
 * it. The component itself is fluid and is exercised at desktop here.
 *
 * The demo account's gigs do not all have a setlist attached, so the trigger is
 * looked up across cards rather than assumed on the first one.
 */

test.describe('Stage Mode', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  /** Opens a gig card that actually has a setlist, or skips. */
  async function openStageFromGigCard(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'gigs');
    await waitForGigCards(tab);

    const trigger = tab.getByTestId('stage-mode-button').first();
    test.skip(
      (await trigger.count()) === 0,
      'No gig on the demo account has a setlist attached'
    );

    await trigger.waitFor({ state: 'visible', timeout: 30_000 });
    await trigger.click();
    await expect(tab.getByTestId('stage-mode')).toBeVisible({ timeout: 30_000 });
    // The setlist is fetched on mount; counting rows before it lands is a race.
    await expect(tab.getByTestId('stage-setlist')).toBeVisible({ timeout: 30_000 });
    return tab;
  }

  /** Number of rendered setlist rows. */
  async function rowCount(tab: import('@playwright/test').Page): Promise<number> {
    return tab.locator('[data-testid^="stage-item-"]').count();
  }

  test('opens from a gig card and shows the stage header', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    // The gig name and a running clock: the two things read at arm's length.
    await expect(tab.getByTestId('stage-gig-name')).not.toBeEmpty();
    await expect(tab.getByTestId('stage-clock')).toHaveText(/^\d{1,2}:\d{2}(:\d{2})?$/);
    await expect(tab.getByTestId('stage-remaining')).toBeVisible();

    // The progress bar is attached but legitimately zero-width seconds into a
    // set, so its presence is asserted rather than its visibility.
    await expect(tab.getByTestId('stage-progress')).toBeAttached();
    expect(await tab.getByTestId('stage-progress').getAttribute('class')).toContain('bg-');
    await tab.close();
  });

  test('renders the setlist with the first song marked as now playing', async ({
    page,
  }) => {
    const tab = await openStageFromGigCard(page);

    await expect(tab.getByTestId('stage-setlist')).toBeVisible({ timeout: 30_000 });
    await expect(tab.getByTestId('stage-now-playing')).toBeVisible();

    // The active row is the first one and is the only marked row.
    await expect(tab.getByTestId('stage-item-0')).toHaveAttribute('data-active', 'true');
    await expect(tab.getByTestId('stage-item-1')).toHaveAttribute('data-active', 'false');
    await tab.close();
  });

  test('advances and rewinds the active song', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    await expect(tab.getByTestId('stage-item-0')).toHaveAttribute('data-active', 'true');

    await tab.getByTestId('stage-next').click();
    await expect(tab.getByTestId('stage-item-1')).toHaveAttribute('data-active', 'true');
    await expect(tab.getByTestId('stage-item-0')).toHaveAttribute('data-active', 'false');

    await tab.getByTestId('stage-prev').click();
    await expect(tab.getByTestId('stage-item-0')).toHaveAttribute('data-active', 'true');
    await tab.close();
  });

  test('jumps straight to a song on tap', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    const rows = await rowCount(tab);
    expect(rows).toBeGreaterThan(0);

    // Tapping the last row must make it the live one, whatever the set size.
    const last = rows - 1;
    await tab.getByTestId(`stage-item-${last}`).click();
    await expect(tab.getByTestId(`stage-item-${last}`)).toHaveAttribute(
      'data-active',
      'true'
    );
    await tab.close();
  });

  test('shows an up-next cue while something follows', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    const rows = await rowCount(tab);
    expect(rows).toBeGreaterThan(1);

    // On the first row the following row is cued as "up next".
    await expect(tab.getByTestId('stage-up-next')).toBeVisible();

    // On the last row there is nothing after it, so the cue disappears.
    await tab.getByTestId(`stage-item-${rows - 1}`).click();
    await expect(tab.getByTestId('stage-up-next')).toHaveCount(0);
    await tab.close();
  });

  test('leaves the stage and returns to the dashboard', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    await tab.getByTestId('stage-exit').click();
    await expect(tab.getByTestId('stage-mode')).toHaveCount(0, { timeout: 15_000 });
    await expect(tab.getByTestId('gig-card').first()).toBeVisible();
    await tab.close();
  });

  test('keeps the stage inside the viewport', async ({ page }) => {
    const tab = await openStageFromGigCard(page);

    const overflow = await tab.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Controls must stay reachable without a horizontal swipe.
    for (const id of ['stage-prev', 'stage-next', 'stage-exit']) {
      const box = await tab.getByTestId(id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(DESKTOP.width + 1);
      // Touch targets stay usable.
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await tab.close();
  });
});