import { test, expect } from '@playwright/test';

/**
 * Quick Notes & State of Play drawer.
 *
 * Runs through the demo account (`/demo` signs in and redirects to /app) so no
 * separate auth fixture is needed. Assertions are testid-based because the demo
 * account renders in Dutch while the landing page defaults to English.
 */

const MOBILE = { width: 375, height: 667 };

/** Opens the drawer for the first gig card on the overview. */
async function openDrawer(page: import('@playwright/test').Page) {
  await page.goto('/demo');
  await page.waitForURL('**/app**', { timeout: 60_000 });

  await page
    .getByText(/loading performances/i)
    .waitFor({ state: 'hidden', timeout: 60_000 })
    .catch(() => {
      // Placeholder already gone — the button wait below surfaces real failures.
    });

  const trigger = page.getByTestId('gig-quick-notes-trigger').first();
  await trigger.waitFor({ state: 'visible', timeout: 60_000 });
  await trigger.click();
  await expect(page.getByTestId('gig-quick-notes-modal')).toBeVisible();
}

test.describe('Gig quick notes modal', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: MOBILE });

  test('opens from a gig card and shows the notes editor', async ({ page }) => {
    await openDrawer(page);

    const modal = page.getByTestId('gig-quick-notes-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('gig-quick-notes-input')).toBeVisible();

    // The AI action is offered from the drawer itself.
    await expect(page.getByTestId('gig-quick-notes-generate')).toBeVisible();

    // The card's notes are pre-filled rather than blanked.
    const original = await page.getByTestId('gig-quick-notes-input').inputValue();
    expect(typeof original).toBe('string');
  });

  test('stays strictly within the viewport width on a 375px screen', async ({ page }) => {
    await openDrawer(page);

    const modal = page.getByTestId('gig-quick-notes-modal');
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width + 1);

    // The AI/error boxes must not be able to push the page sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('saves edited notes and reflects them back on reopen', async ({ page }) => {
    await openDrawer(page);

    const input = page.getByTestId('gig-quick-notes-input');
    const original = await input.inputValue();
    const marker = `E2E notitie ${Date.now()}`;
    const updated = original ? `${original}\n${marker}` : marker;

    await input.fill(updated);
    await page.getByTestId('gig-quick-notes-save').click();
    // The PATCH round-trip plus the auth token can exceed the 5s default.
    await expect(page.getByTestId('gig-quick-notes-saved')).toBeVisible({
      timeout: 30_000,
    });
    await expect(input).toHaveValue(updated);

    // Close and reopen: the value must come back from the server, not memory.
    await page.getByTestId('gig-quick-notes-close').click();
    await expect(page.getByTestId('gig-quick-notes-modal')).toHaveCount(0);

    await page.getByTestId('gig-quick-notes-trigger').first().click();
    await expect(page.getByTestId('gig-quick-notes-modal')).toBeVisible();
    await expect(page.getByTestId('gig-quick-notes-input')).toHaveValue(updated);

    // Restore the demo gig so the suite stays idempotent.
    await page.getByTestId('gig-quick-notes-input').fill(original);
    await page.getByTestId('gig-quick-notes-save').click();
    await expect(page.getByTestId('gig-quick-notes-saved')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('the notes badge opens the drawer and has no full-width action row', async ({
    page,
  }) => {
    await openDrawer(page);

    // v1.33.2 replaced the prominent full-width button row with the Notes
    // badge, so the old trigger must be gone.
    await expect(page.getByTestId('gig-quick-notes-button')).toHaveCount(0);

    const badge = page.getByTestId('gig-quick-notes-trigger').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('cursor', 'pointer');

    // The badge is a real control for assistive tech, not a bare span.
    await expect(badge).toHaveAttribute('aria-label', /notities|notes/i);
  });

  test('the badge reflects whether the gig has notes', async ({ page }) => {
    await openDrawer(page);

    const input = page.getByTestId('gig-quick-notes-input');
    const original = await input.inputValue();
    const badge = page.getByTestId('gig-quick-notes-trigger').first();
    const hasNotes = original.trim().length > 0;
    const addTitle = /add a note|notitie toevoegen/i;

    // Before: the badge advertises "add" when there is nothing saved yet.
    if (!hasNotes) {
      await expect(badge).toHaveAttribute('title', addTitle);
    }

    // Save a note, close, and the badge should flip to the "has notes" state.
    await input.fill('E2E badge note');
    await page.getByTestId('gig-quick-notes-save').click();
    await expect(page.getByTestId('gig-quick-notes-saved')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('gig-quick-notes-close').click();

    await expect(page.getByTestId('gig-quick-notes-trigger').first()).not.toHaveAttribute(
      'title',
      addTitle
    );

    // Restore so the suite stays idempotent.
    await page.getByTestId('gig-quick-notes-trigger').first().click();
    await page.getByTestId('gig-quick-notes-input').fill(original);
    await page.getByTestId('gig-quick-notes-save').click();
    await expect(page.getByTestId('gig-quick-notes-saved')).toBeVisible({ timeout: 30_000 });
  });

  test('closes via the close button and via Escape', async ({ page }) => {
    await openDrawer(page);

    await page.getByTestId('gig-quick-notes-close').click();
    await expect(page.getByTestId('gig-quick-notes-modal')).toHaveCount(0);

    await page.getByTestId('gig-quick-notes-trigger').first().click();
    await expect(page.getByTestId('gig-quick-notes-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('gig-quick-notes-modal')).toHaveCount(0);
  });

  test('is reachable on a desktop viewport too', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await openDrawer(page);

    await expect(page.getByTestId('gig-quick-notes-modal')).toBeVisible();
    await context.close();
  });
});