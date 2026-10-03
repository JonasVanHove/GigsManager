import { test, expect } from '@playwright/test';

const TABS = ['basic', 'logistics', 'financials', 'ai'] as const;

/**
 * Establishes the Supabase session by visiting /demo.
 *
 * /demo finishes with a client-side router.replace('/app') that is still in
 * flight afterwards, and any navigation started on this page gets cancelled by
 * it ("Navigation to ... is interrupted by another navigation to /app"). This
 * function therefore only signs in; callers navigate in a fresh tab.
 */
async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/demo');
  await page.waitForURL('**/app**', { timeout: 60_000 });
}

/**
 * Returns a second tab already navigated to `path`.
 *
 * It shares the signed-in session (same context, same origin) but not the
 * pending redirect. `networkidle` also lets React hydrate, without which typing
 * into the controlled code input never reaches the onChange handler.
 */
async function workTab(
  page: import('@playwright/test').Page,
  path: string
): Promise<import('@playwright/test').Page> {
  const tab = await page.context().newPage();
  const currentViewport = page.viewportSize();
  if (currentViewport) {
    await tab.setViewportSize(currentViewport);
  }
  await tab.goto(path);
  await tab.waitForLoadState('networkidle');
  return tab;
}

/**
 * Opens the Edit Performance dialog through the demo account using a fresh workTab.
 */
async function openGigForm(page: import('@playwright/test').Page) {
  await signIn(page);
  const tab = await workTab(page, '/app');

  // The overview fetches gigs asynchronously and renders a loading placeholder
  // first; wait for that to clear before hunting for the edit affordance.
  await tab
    .getByText(/loading performances/i)
    .waitFor({ state: 'hidden', timeout: 60_000 })
    .catch(() => {
      // Placeholder already gone (or absent on this layout) — fall through and
      // let the edit-button wait below produce the actionable error.
    });

  const editButton = tab.getByTestId('edit-performance-button').first();
  await editButton.waitFor({ state: 'visible', timeout: 60_000 });
  await editButton.click();

  const tabs = tab.getByTestId('gig-form-tabs');
  // Generous: the dialog mounts after the gigs fetch, and a fully loaded CI
  // box running every project in parallel can push this well past 15s.
  await expect(tabs).toBeVisible({ timeout: 45_000 });
  return { tab, tabs };
}

test.describe('GigForm tabs', () => {
  // The demo account load involves a Supabase sign-in plus a gigs fetch, which
  // comfortably exceeds the 30s default on an emulated mobile device.
  test.describe.configure({ timeout: 90_000 });

  test.describe('mobile (375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('switches between all four tabs', async ({ page }) => {
      const { tab } = await openGigForm(page);

      for (const t of TABS) {
        await tab.getByTestId(`gig-form-tab-${t}`).click();
        await expect(tab.getByTestId(`gig-form-tab-${t}`)).toHaveAttribute('aria-selected', 'true');
      }

      await tab.close();
    });

    test('the tab strip scrolls horizontally instead of clipping', async ({ page }) => {
      const { tab } = await openGigForm(page);
      const strip = tab.locator('[data-testid="gig-form-tabs"] > div');

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

      await tab.close();
    });
  });

  test('shows only the active tab panel', async ({ page }) => {
    const { tab } = await openGigForm(page);

    // Logistics and AI have dedicated panels; the other sections are gated by
    // the same activeTab state.
    await expect(tab.getByTestId('gig-form-panel-logistics')).toBeHidden();
    await expect(tab.getByTestId('gig-form-panel-ai')).toBeHidden();

    await tab.getByTestId('gig-form-tab-logistics').click();
    await expect(tab.getByTestId('gig-form-panel-logistics')).toBeVisible();
    await expect(tab.getByTestId('gig-form-panel-ai')).toBeHidden();

    await tab.getByTestId('gig-form-tab-ai').click();
    await expect(tab.getByTestId('gig-form-panel-ai')).toBeVisible();
    await expect(tab.getByTestId('gig-form-panel-logistics')).toBeHidden();

    await tab.close();
  });

  test('keeps field values while switching tabs', async ({ page }) => {
    const { tab } = await openGigForm(page);

    const eventName = tab.getByPlaceholder('e.g. Jazz at the Park');
    await expect(eventName).toBeVisible();
    const original = await eventName.inputValue();

    await tab.getByTestId('gig-form-tab-financials').click();
    await expect(tab.getByTestId('gig-form-tab-financials')).toHaveAttribute('aria-selected', 'true');
    await tab.getByTestId('gig-form-tab-basic').click();

    // The Basic Info panel is mounted the whole time, so no state is dropped.
    await expect(eventName).toHaveValue(original);

    await tab.close();
  });
});