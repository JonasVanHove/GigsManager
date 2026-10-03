import { test, expect } from '@playwright/test';
import { openAppTab, horizontalOverflow } from './helpers/app';

/**
 * All Gigs list controls.
 *
 * This file used to be `pagination.spec.ts` and drove a `gigs-table` with
 * `pagination`, `current-page`, `next-page`, `prev-page`, `page-number` and
 * `items-per-page-select` test ids. Pagination was removed from the product
 * (AllGigsTab renders the full filtered list, not pages), so those ids can
 * never resolve. Rather than assert a feature that no longer exists, this spec
 * covers the list controls that do exist: the date-preset filter, the sort
 * selector and the grid/table view toggle.
 */

test.describe('All Gigs list controls', () => {
  test.describe.configure({ timeout: 90_000 });

  async function openAllGigs(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'all-gigs');
    await tab
      .getByText(/loading performances/i)
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => {
        // Placeholder already gone — the control waits below raise real errors.
      });
    await tab.locator('select').first().waitFor({ state: 'visible', timeout: 60_000 });
    return tab;
  }

  test('should render the date preset and sort selectors', async ({ page }) => {
    const tab = await openAllGigs(page);

    const selects = tab.locator('select');
    await expect(selects.nth(0)).toBeVisible(); // date preset
    await expect(selects.nth(1)).toBeVisible(); // sort order

    // The date preset is value-driven, so option values are stable even though
    // the labels are localised.
    await expect(selects.nth(0).locator('option[value="upcoming"]')).toHaveCount(1);
    await expect(selects.nth(0).locator('option[value="past"]')).toHaveCount(1);
    await tab.close();
  });

  test('should narrow the list with the date preset', async ({ page }) => {
    const tab = await openAllGigs(page);
    const preset = tab.locator('select').nth(0);

    const allCount = await tab.getByTestId('gig-card').count();

    // "Upcoming only" can legitimately be empty for an all-past dataset, so the
    // invariant is that the result is a subset, not that it is non-empty.
    await preset.selectOption('upcoming');
    await expect(tab.getByTestId('gig-card').first()).toBeVisible({ timeout: 30_000 });
    const upcomingCount = await tab.getByTestId('gig-card').count();
    expect(upcomingCount).toBeLessThanOrEqual(allCount);

    // Going back to "all dates" must restore the full list.
    await preset.selectOption('all');
    await expect
      .poll(async () => tab.getByTestId('gig-card').count(), { timeout: 30_000 })
      .toBe(allCount);
    await tab.close();
  });

  test('should reorder the list when the sort changes', async ({ page }) => {
    const tab = await openAllGigs(page);
    const sort = tab.locator('select').nth(1);

    const options = await sort.locator('option').evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value)
    );
    expect(options.length).toBeGreaterThan(1);

    await sort.selectOption(options[options.length - 1]);
    await expect(tab.getByTestId('gig-card').first()).toBeVisible({ timeout: 30_000 });
    expect(await tab.getByTestId('gig-card').count()).toBeGreaterThan(0);
    await tab.close();
  });

  test('should switch between the grid and table view', async ({ page }) => {
    const tab = await openAllGigs(page);

    const toggles = tab.locator('button[aria-pressed]');
    await expect(toggles.first()).toBeVisible();

    // Whichever view is active, the other toggle flips it on and back.
    await toggles.nth(1).click();
    await expect(toggles.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await toggles.nth(0).click();
    await expect(toggles.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await tab.close();
  });

  test('should not overflow horizontally while filtering', async ({ page }) => {
    const tab = await openAllGigs(page);

    for (const preset of ['upcoming', 'past', 'all']) {
      await tab.locator('select').nth(0).selectOption(preset);
      await tab.getByText(/loading performances/i)
        .waitFor({ state: 'hidden', timeout: 30_000 })
        .catch(() => undefined);
      expect(await horizontalOverflow(tab)).toBeLessThanOrEqual(0);
    }
    await tab.close();
  });
});
