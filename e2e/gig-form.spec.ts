import { test, expect } from '@playwright/test';

const TABS = ['basic', 'logistics', 'financials', 'ai'] as const;

/**
 * Opens the Edit Performance dialog through the demo account. `/demo` performs
 * the Supabase sign-in itself and redirects to /app, which avoids standing up
 * a separate auth fixture for a purely presentational concern.
 */
async function openGigForm(page: import('@playwright/test').Page) {
  await page.goto('/demo');
  await page.waitForURL('**/app**', { timeout: 60_000 });

  // The overview fetches gigs asynchronously and renders a loading placeholder
  // first; wait for that to clear before hunting for the edit affordance.
  await page
    .getByText(/loading performances/i)
    .waitFor({ state: 'hidden', timeout: 60_000 })
    .catch(() => {
      // Placeholder already gone (or absent on this layout) — fall through and
      // let the edit-button wait below produce the actionable error.
    });

  const editButton = page.getByTestId('edit-performance-button').first();
  await editButton.waitFor({ state: 'visible', timeout: 60_000 });
  await editButton.click();

  const tabs = page.getByTestId('gig-form-tabs');
  // Generous: the dialog mounts after the gigs fetch, and a fully loaded CI
  // box running every project in parallel can push this well past 15s.
  await expect(tabs).toBeVisible({ timeout: 45_000 });
  return tabs;
}

test.describe('GigForm tabs', () => {
  // The demo account load involves a Supabase sign-in plus a gigs fetch, which
  // comfortably exceeds the 30s default on an emulated mobile device.
  test.describe.configure({ timeout: 90_000 });

  test.describe('mobile (375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('switches between all four tabs', async ({ page }) => {
      const tabs = await openGigForm(page);

      for (const tab of TABS) {
        await page.getByTestId(`gig-form-tab-${tab}`).click();
        await expect(page.getByTestId(`gig-form-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      }
    });

    test('the tab strip scrolls horizontally instead of clipping', async ({ page }) => {
      await openGigForm(page);
      const strip = page.locator('[data-testid="gig-form-tabs"] > div');

      const { scrollWidth, clientWidth } = await strip.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));

      // Either it fits (no scroll needed) or it is genuinely scrollable.
      expect(scrollWidth).toBeGreaterThan(0);
      if (scrollWidth > clientWidth) {
        const overflowX = await strip.evaluate((el) => getComputedStyle(el).overflowX);
        expect(overflowX).toBe('auto');
      }
    });
  });

  test('shows only the active tab panel', async ({ page }) => {
    await openGigForm(page);

    // Logistics and AI have dedicated panels; the other sections are gated by
    // the same activeTab state.
    await expect(page.getByTestId('gig-form-panel-logistics')).toBeHidden();
    await expect(page.getByTestId('gig-form-panel-ai')).toBeHidden();

    await page.getByTestId('gig-form-tab-logistics').click();
    await expect(page.getByTestId('gig-form-panel-logistics')).toBeVisible();
    await expect(page.getByTestId('gig-form-panel-ai')).toBeHidden();

    await page.getByTestId('gig-form-tab-ai').click();
    await expect(page.getByTestId('gig-form-panel-ai')).toBeVisible();
    await expect(page.getByTestId('gig-form-panel-logistics')).toBeHidden();
  });

  test('keeps field values while switching tabs', async ({ page }) => {
    await openGigForm(page);

    const eventName = page.getByPlaceholder('e.g. Jazz at the Park');
    await expect(eventName).toBeVisible();
    const original = await eventName.inputValue();

    await page.getByTestId('gig-form-tab-financials').click();
    await expect(page.getByTestId('gig-form-tab-financials')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('gig-form-tab-basic').click();

    // The Basic Info panel is mounted the whole time, so no state is dropped.
    await expect(eventName).toHaveValue(original);
  });
});