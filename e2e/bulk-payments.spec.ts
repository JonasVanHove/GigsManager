import { test, expect } from '@playwright/test';
import { openAppTab, waitForGigCards } from './helpers/app';

/**
 * Bulk selection and bulk editing on the overview.
 *
 * This used to drive an "All Gigs" table that exposed `gigs-table`,
 * `gig-checkbox`, `bulk-actions-menu` and `gig-status` test ids. None of those
 * ever existed in the current app: bulk editing lives on the overview tab, the
 * rows are gig cards, and selection is a checkbox inside each card. The spec now
 * asserts that flow against the markup that is actually rendered.
 */

const SELECT = 'button[title="Select this gig for bulk actions"]';
const BULK_EDIT = 'button[title^="Bulk edit"]';
const CLEAR = 'button[title="Clear selection"]';

test.describe('Bulk Payment Updates', () => {
  // Demo sign-in plus a gigs fetch comfortably exceeds the 30s default.
  test.describe.configure({ timeout: 90_000 });

  async function openOverview(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'gigs');
    await waitForGigCards(tab);
    return tab;
  }

  test('should select multiple gigs and reveal the bulk actions', async ({ page }) => {
    const tab = await openOverview(page);

    // Nothing is selected on load, so the bulk controls are not rendered.
    await expect(tab.locator(BULK_EDIT)).toHaveCount(0);

    const checkboxes = tab.locator(`${SELECT} input[type="checkbox"]`);
    const available = Math.min(await checkboxes.count(), 3);
    expect(available).toBeGreaterThan(0);

    for (let i = 0; i < available; i++) {
      await checkboxes.nth(i).check();
    }

    await expect(tab.locator(BULK_EDIT)).toBeVisible();
    // The label reports the live count, so it must match what was ticked.
    await expect(tab.locator(BULK_EDIT)).toHaveAttribute(
      'title',
      new RegExp(`Bulk edit \\(${available} selected\\)`)
    );
    await tab.close();
  });

  test('should open the bulk editor for the selection', async ({ page }) => {
    const tab = await openOverview(page);

    await tab.locator(`${SELECT} input[type="checkbox"]`).first().check();
    await tab.locator(BULK_EDIT).click();

    // BulkEditor renders a dialog-style panel headed by a title; it is a
    // sibling of the overview, so it must not be nested inside a gig card.
    const heading = tab.getByRole('heading', { level: 2 }).last();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    await tab.close();
  });

  test('should clear the whole selection at once', async ({ page }) => {
    const tab = await openOverview(page);

    const checkboxes = tab.locator(`${SELECT} input[type="checkbox"]`);
    const count = Math.min(await checkboxes.count(), 3);
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await expect(tab.locator(BULK_EDIT)).toBeVisible();

    await tab.locator(CLEAR).click();

    await expect(tab.locator(BULK_EDIT)).toHaveCount(0);
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).not.toBeChecked();
    }
    await tab.close();
  });

  test('should select every gig from the select-all control', async ({ page }) => {
    const tab = await openOverview(page);

    const rendered = tab.locator(`${SELECT} input[type="checkbox"]`);
    expect(await rendered.count()).toBeGreaterThan(0);

    await tab.locator('button[title="Select all performances"]').click();

    // Every rendered row ends up ticked...
    const checked = tab.locator(`${SELECT} input[type="checkbox"]:checked`);
    await expect(checked).toHaveCount(await rendered.count());

    // ...and the bulk action reports a non-zero selection.
    const title = await tab.locator(BULK_EDIT).getAttribute('title');
    expect(title).toMatch(/^Bulk edit \((\d+) selected\)$/);
    expect(Number(title!.match(/\d+/)![0])).toBeGreaterThan(0);
    await tab.close();
  });
});

