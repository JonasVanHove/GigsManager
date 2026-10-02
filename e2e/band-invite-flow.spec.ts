import { test, expect } from '@playwright/test';

/**
 * Band invite flow: a leader mints a QR/code on a band card, and a signed-in
 * bandmate accepts it on /join.
 *
 * Runs against the demo account (/demo signs in and redirects to /app).
 * Assertions are testid-based because the demo account renders in Dutch while
 * the join screen is deliberately English-only.
 */

const MOBILE = { width: 375, height: 667 };
const CODE_PATTERN = /^[A-Z2-9]{6}$/;

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
  await tab.setViewportSize(MOBILE);
  await tab.goto(path);
  await tab.waitForLoadState('networkidle');
  return tab;
}

/** Signs in, opens the Bands tab and clicks the first band's invite button. */
async function openInviteDialog(
  page: import('@playwright/test').Page
): Promise<import('@playwright/test').Page> {
  await signIn(page);
  // The dashboard honours ?tab=, which avoids opening a nav drawer/dropdown and
  // avoids depending on the (localised) tab label.
  const tab = await workTab(page, '/app?tab=bands');

  const trigger = tab.getByTestId('band-invite-button').first();
  await trigger.waitFor({ state: 'visible', timeout: 60_000 });
  await trigger.click();
  await expect(tab.getByTestId('band-invite-modal')).toBeVisible();
  return tab;
}

test.describe('Band invite flow', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: MOBILE });

  test('generates a scannable QR and a 6-character code per band', async ({ page }) => {
    const tab = await openInviteDialog(page);

    const code = tab.getByTestId('band-invite-code');
    await expect(code).toBeVisible({ timeout: 30_000 });

    const value = (await code.textContent())?.trim() ?? '';
    expect(value).toMatch(CODE_PATTERN);

    // The QR is an actual rendered SVG, not a placeholder.
    const qr = tab.getByTestId('band-invite-qr');
    await expect(qr).toBeVisible();
    await expect(qr.locator('svg')).toHaveCount(1);

    await tab.close();
  });

  test('copies the invite link', async ({ page, context, browserName }) => {
    // clipboard-read is Chromium-only; Firefox and WebKit reject the permission
    // outright, so those browsers assert the copied state instead.
    const canReadClipboard = browserName === 'chromium';
    if (canReadClipboard) {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }

    const tab = await openInviteDialog(page);
    await expect(tab.getByTestId('band-invite-code')).toBeVisible({ timeout: 30_000 });

    await tab.getByTestId('band-invite-copy').click();
    await expect(tab.getByTestId('band-invite-copy')).toContainText(/copied/i, {
      timeout: 15_000,
    });

    if (canReadClipboard) {
      const clipboard = await tab.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toMatch(/\/join\?code=[A-Z2-9]{6}$/);
    }

    await tab.close();
  });
test('accepting an invitation from the QR link shows the band and joins', async ({ page }) => {
    const tab = await openInviteDialog(page);
    await expect(tab.getByTestId('band-invite-code')).toBeVisible({ timeout: 30_000 });
    const inviteCode = ((await tab.getByTestId('band-invite-code').textContent()) ?? '').trim();
    await tab.close();

    // Arrive on /join exactly as a scanned QR would.
    const joinPage = await workTab(page, `/join?code=${inviteCode}`);
    const preview = joinPage.getByTestId('join-preview');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText(/You've been invited to join/i);

    // Joining is idempotent, so a repeat run sees the already-a-member state
    // and gets a shortcut instead of the Accept button. Both are correct.
    const submit = joinPage.getByTestId('join-submit');
    const dashboard = joinPage.getByTestId('join-dashboard');
    if (await submit.isVisible().catch(() => false)) {
      await expect(submit).toBeEnabled();
      await submit.click();
    } else {
      await expect(dashboard).toBeVisible();
      await dashboard.click();
    }

    // Accepting syncs the shared gigs and lands the user on their dashboard.
    await joinPage.waitForURL('**/app**', { timeout: 60_000 });
    await expect(joinPage.getByTestId('gig-quick-notes-button').first()).toBeVisible({
      timeout: 60_000,
    });
    await joinPage.close();
  });

  test('rejects an unknown code without leaving the join screen', async ({ page }) => {
    await signIn(page);
    const joinPage = await workTab(page, '/join');
    const input = joinPage.getByTestId('join-code-input');
    await expect(input).toBeVisible();

    // 'O' and '0' are not in the alphabet, so this can never resolve.
    // pressSequentially is used instead of fill(): it emits real key events,
    // which the controlled input needs on WebKit.
    await input.click();
    await input.pressSequentially('OO0OO0', { delay: 40 });

    await expect(joinPage.getByTestId('join-error')).toBeVisible({ timeout: 30_000 });
    await expect(joinPage.getByTestId('join-submit')).toBeDisabled();
    await joinPage.close();
  });

  test('the join screen fits a 375px viewport', async ({ page }) => {
    await signIn(page);
    const joinPage = await workTab(page, '/join');
    await expect(joinPage.getByTestId('join-code-input')).toBeVisible();

    const overflow = await joinPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await joinPage.close();
  });
});
