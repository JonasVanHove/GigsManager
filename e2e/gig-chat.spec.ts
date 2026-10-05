import { test, expect } from '@playwright/test';

/**
 * v1.47.0 — "Gig chat / Overleg": the in-app logistics thread on a gig card.
 *
 * Runs through the demo account (`/demo` signs in and redirects to /app), the
 * same way gig-notes-modal does. The flow covers opening the drawer from the
 * card, the composer, posting a message (which round-trips through
 * POST /api/gigs/:id/chat and renders immediately) and closing again.
 */

const MOBILE = { width: 375, height: 667 };

/** Opens the chat drawer for the first gig card on the overview. */
async function openChat(page: import('@playwright/test').Page) {
  await page.goto('/demo');
  await page.waitForURL('**/app**', { timeout: 60_000 });

  const trigger = page.getByTestId('gig-chat-button').first();

  const waitForCards = async (timeout: number) => {
    await page
      .getByText(/loading performances/i)
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {
        // Placeholder already gone — the trigger wait surfaces real failures.
      });
    await trigger.waitFor({ state: 'visible', timeout });
  };

  try {
    await waitForCards(30_000);
  } catch {
    // The list never came up on the redirected tab; re-enter the dashboard.
    await page.goto('/app?tab=gigs', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await waitForCards(60_000);
  }

  await trigger.click();
  await expect(page.getByTestId('gig-chat-modal')).toBeVisible();
}

test.describe('Gig chat / Overleg', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: MOBILE });

  test('opens from a gig card with an empty-state or existing thread', async ({ page }) => {
    await openChat(page);

    const modal = page.getByTestId('gig-chat-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('gig-chat-input')).toBeVisible();
    await expect(page.getByTestId('gig-chat-send')).toBeVisible();

    // Either the thread already has messages or the empty state shows — never
    // a spinner that never resolves.
    await expect(
      page.getByTestId('gig-chat-message').first().or(page.getByTestId('gig-chat-empty'))
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('gig-chat-close').click();
    await expect(modal).toBeHidden();
  });

  test('posts a logistics message that renders in the thread', async ({ page }) => {
    await openChat(page);

    const message = `carpool Antwerpen ${Date.now()}`;
    await page.getByTestId('gig-chat-input').fill(message);
    await page.getByTestId('gig-chat-send').click();

    await expect(
      page.getByTestId('gig-chat-message').filter({ hasText: message })
    ).toBeVisible({ timeout: 15_000 });

    // The composer clears after a successful send.
    await expect(page.getByTestId('gig-chat-input')).toHaveValue('');

    // The drawer stays usable and closes cleanly afterwards.
    await page.getByTestId('gig-chat-close').click();
    await expect(page.getByTestId('gig-chat-modal')).toBeHidden();
    await expect(page.getByTestId('gig-chat-button').first()).toBeVisible();
  });
});
