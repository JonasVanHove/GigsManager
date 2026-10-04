import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab, waitForGigCards } from './helpers/app';

/**
 * Attendance removed (v1.41.0): the quick RSVP buttons, the attendance badge and
 * the per-member status pills are gone, and nothing on the gig card should try
 * to fetch the deleted /api/gigs/:id/rsvp route.
 *
 * These are negative assertions on purpose — the feature is gone, so the test
 * passes when the old affordances stay absent. Asserting absence is the only way
 * to keep removed UI from creeping back in.
 *
 * Desktop only: the gig card's expanded content is collapsed on the mobile
 * shell, the same constraint the other card specs are pinned to.
 */

test.describe('Attendance removed', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  test('the quick RSVP section is gone from an expanded gig card', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await waitForGigCards(tab);

    const card = tab.getByTestId('gig-card').first();
    test.skip((await card.count()) === 0, 'No gig cards on the demo account');
    await card.waitFor({ state: 'visible', timeout: 30_000 });

    await expect(card.getByTestId('rsvp-section')).toHaveCount(0);
    await expect(card.getByTestId('rsvp-summary-badge')).toHaveCount(0);
    await expect(card.getByTestId('rsvp-btn-attending')).toHaveCount(0);
    await expect(card.getByTestId('rsvp-btn-declined')).toHaveCount(0);
    await expect(card.getByTestId('rsvp-btn-maybe')).toHaveCount(0);
    await tab.close();
  });

  test('no per-member attendance pills render', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await waitForGigCards(tab);

    const card = tab.getByTestId('gig-card').first();
    test.skip((await card.count()) === 0, 'No gig cards on the demo account');
    await card.waitFor({ state: 'visible', timeout: 30_000 });

    // The pills were `rsvp-member-<id>`; nothing may match that shape anymore.
    expect(await card.locator('[data-testid^="rsvp-member-"]').count()).toBe(0);
    await tab.close();
  });

  test('the deleted RSVP endpoint is never called', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');

    const rsvpCalls: string[] = [];
    tab.on('request', (request) => {
      if (request.url().includes('/rsvp')) rsvpCalls.push(request.url());
    });

    await waitForGigCards(tab);
    await tab.waitForTimeout(1500);

    expect(rsvpCalls).toEqual([]);
    await tab.close();
  });

  test('the rest of the card still works without attendance', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await waitForGigCards(tab);

    const card = tab.getByTestId('gig-card').first();
    test.skip((await card.count()) === 0, 'No gig cards on the demo account');
    await card.waitFor({ state: 'visible', timeout: 30_000 });

    // The financial breakdown lived directly below the removed section, so its
    // absence would mean the edit took more than intended.
    await expect(card.getByTestId('gig-financials-button')).toBeVisible();
    await tab.close();
  });
});
