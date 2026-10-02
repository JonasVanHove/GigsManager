import { test, expect, devices } from '@playwright/test';

/**
 * The landing page is the first thing a phone visitor sees, so the nav and the
 * hero CTAs are exercised at the two viewport widths that dominate real
 * traffic rather than at a synthetic 320px.
 */
const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12/13/14', width: 390, height: 844 },
] as const;

test.describe('Landing page on mobile', () => {
  // The landing page waits on Supabase auth resolution before it swaps the
  // Suspense fallback for the real header, which is slow on Firefox.
  test.describe.configure({ timeout: 60_000 });

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // The landing page renders behind a Suspense fallback while auth state
        // resolves; the hamburger only exists once the real header mounts.
        await expect(page.getByTestId('landing-menu-button')).toBeVisible({ timeout: 30_000 });
      });

      test('hamburger toggle opens and closes the menu', async ({ page }) => {
        const toggle = page.getByTestId('landing-menu-button');
        const menu = page.getByTestId('landing-mobile-menu');

        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle).toHaveAttribute('aria-controls', 'landing-mobile-menu');
        await expect(menu).toHaveCount(0);

        await toggle.click();
        await expect(menu).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        await toggle.click();
        await expect(menu).toHaveCount(0);
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      });

      test('secondary nav links move into the menu below the sm breakpoint', async ({ page }) => {
        await expect(page.getByTestId('landing-nav-live-demo')).toBeHidden();
        await expect(page.getByTestId('landing-nav-log-in')).toBeHidden();
        await expect(page.getByTestId('landing-nav-get-started')).toBeHidden();

        await page.getByTestId('landing-menu-button').click();
        const menu = page.getByTestId('landing-mobile-menu');
        await expect(menu.getByRole('link', { name: /live demo/i })).toBeVisible();
        await expect(menu.getByRole('button', { name: /log in/i })).toBeVisible();
        await expect(menu.getByRole('button', { name: /get started/i })).toBeVisible();
      });

      test('tapping a menu link closes the menu', async ({ page }) => {
        await page.getByTestId('landing-menu-button').click();
        const menu = page.getByTestId('landing-mobile-menu');

        await menu.getByRole('link', { name: /features/i }).click();
        await expect(page.getByTestId('landing-mobile-menu')).toHaveCount(0);
      });

      test('hero CTAs stack vertically and stay inside the viewport', async ({ page }) => {
        const primary = page.getByRole('button', { name: /get started/i }).first();
        const demo = page.getByRole('link', { name: /open live demo/i }).first();

        await expect(primary).toBeVisible();
        await expect(demo).toBeVisible();

        // Stacked: the demo CTA sits fully below the primary one.
        const primaryBox = await primary.boundingBox();
        const demoBox = await demo.boundingBox();
        expect(primaryBox).not.toBeNull();
        expect(demoBox).not.toBeNull();
        expect(demoBox!.y).toBeGreaterThanOrEqual(primaryBox!.y + primaryBox!.height - 1);

        // No clipped edges: every box stays within the viewport width.
        for (const box of [primaryBox!, demoBox!]) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      });

      test('no horizontal page overflow', async ({ page }) => {
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.body.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      });
    });
  }

  test('desktop nav is shown and the hamburger is hidden', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.getByTestId('landing-menu-button')).toBeHidden();
    await expect(page.getByTestId('landing-nav-live-demo')).toBeVisible();
    await expect(page.getByTestId('landing-nav-get-started')).toBeVisible();
    await expect(page.getByTestId('landing-mobile-menu')).toHaveCount(0);

    await context.close();
  });
});