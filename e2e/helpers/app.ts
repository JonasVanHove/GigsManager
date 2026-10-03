import type { Page } from '@playwright/test';

/**
 * Shared sign-in + navigation helpers for the app specs.
 *
 * The specs that used to do `page.goto('/')` and then click a tab button were
 * written against an older shell: `/` is the marketing landing page, so the
 * tab buttons never existed there and every test died in beforeEach. These
 * helpers go through the demo account instead, which is the supported way to
 * get a signed-in session in this repo.
 */

export const MOBILE = { width: 375, height: 667 };
export const TABLET = { width: 768, height: 1024 };
export const DESKTOP = { width: 1920, height: 1080 };

/** Tabs the dashboard accepts via `?tab=` (see DASHBOARD_TABS in Dashboard.tsx). */
export type AppTab =
  | 'gigs'
  | 'all-gigs'
  | 'songs'
  | 'bands'
  | 'setlists'
  | 'calendar'
  | 'shared-links';

/**
 * Establishes the Supabase session by visiting /demo.
 *
 * /demo ends with a client-side router.replace('/app') that is still in flight
 * when waitForURL resolves, and any navigation started on this page gets
 * cancelled by it. So this only signs in; callers navigate in a fresh tab.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/demo');
  await page.waitForURL('**/app**', { timeout: 60_000 });
}

/**
 * Returns a second tab on `path`, sharing the signed-in session.
 *
 * `networkidle` also lets React hydrate, which the controlled inputs in the
 * GigForm and the join screen need before typing reaches onChange.
 */
export async function workTab(page: Page, path: string): Promise<Page> {
  const tab = await page.context().newPage();
  const viewport = page.viewportSize();
  if (viewport) await tab.setViewportSize(viewport);
  await tab.goto(path);
  await tab.waitForLoadState('networkidle');
  return tab;
}

/** Signs in and returns a fresh tab already sitting on the requested tab. */
export async function openAppTab(page: Page, tab: AppTab): Promise<Page> {
  await signIn(page);
  return workTab(page, `/app?tab=${tab}`);
}

/**
 * Waits until the overview has actually rendered gig cards.
 *
 * The list is fetched asynchronously behind a "loading performances" placeholder,
 * so anything that looks for a card too early races the request.
 */
export async function waitForGigCards(page: Page): Promise<void> {
  await page
    .getByText(/loading performances/i)
    .waitFor({ state: 'hidden', timeout: 60_000 })
    .catch(() => {
      // Placeholder already gone — the card wait below raises the real error.
    });
  await page.getByTestId('gig-card').first().waitFor({ state: 'visible', timeout: 60_000 });
}

/** True when the page scrolls sideways at the current viewport. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
}