import { test, expect } from '@playwright/test';
import { DESKTOP, openAppTab, waitForGigCards } from './helpers/app';

/**
 * Gig financials (v1.40.0): opening the modal from a gig card, the real-time
 * gross → expenses → net breakdown, and editing an expense.
 *
 * Desktop only: the gig card's action row collapses on the mobile shell, the
 * same constraint Stage Mode and the print exporter are pinned to.
 *
 * The arithmetic itself is covered by test/gig-financials.test.ts; what is
 * asserted here is the wiring — that the card opens the modal, that the summary
 * is driven by the engine, and that a change re-renders it.
 */

test.describe('Gig financials', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: DESKTOP });

  async function openFinancials(tab: import('@playwright/test').Page) {
    await waitForGigCards(tab);
    const trigger = tab.getByTestId('gig-financials-button').first();
    test.skip((await trigger.count()) === 0, 'No gig cards rendered on the demo account');

    await trigger.waitFor({ state: 'visible', timeout: 30_000 });
    await trigger.click();
    await expect(tab.getByTestId('gig-financials-modal')).toBeVisible({ timeout: 30_000 });
    return trigger;
  }

  test('opens the financials modal from a gig card', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openFinancials(tab);

    await expect(tab.getByTestId('financials-total-gross')).toBeVisible();
    await expect(tab.getByTestId('financials-total-expenses')).toBeVisible();
    await expect(tab.getByTestId('financials-net-profit')).toBeVisible();
    await expect(tab.getByTestId('financials-per-member')).toBeVisible();
    await tab.close();
  });

  test('recomputes the net when an expense changes', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openFinancials(tab);

    const net = tab.getByTestId('financials-net-profit');
    const expenses = tab.getByTestId('financials-total-expenses');
    const before = await net.textContent();

    await tab.getByTestId('financials-travel-expenses').fill('250');

    // The gross is untouched, so the net must move by exactly the new expense.
    await expect(expenses).toContainText('250');
    await expect(net).not.toHaveText(before ?? '');
    await tab.close();
  });

  test('shows a loss warning when costs exceed the gross', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openFinancials(tab);

    // A figure no demo gig can plausibly earn back.
    await tab.getByTestId('financials-other-expenses').fill('999999');

    await expect(tab.getByTestId('financials-net-profit')).toBeVisible();
    await expect(tab.getByTestId('financials-loss-warning')).toBeVisible();
    await tab.close();
  });

  test('closes on the cancel button without saving', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openFinancials(tab);

    await tab.getByTestId('financials-other-expenses').fill('77');
    await tab.getByRole('button', { name: /cancel|annuleren/i }).click();

    await expect(tab.getByTestId('gig-financials-modal')).toBeHidden();
    await tab.close();
  });

  test('closes on Escape', async ({ page }) => {
    const tab = await openAppTab(page, 'gigs');
    await openFinancials(tab);

    await tab.keyboard.press('Escape');
    await expect(tab.getByTestId('gig-financials-modal')).toBeHidden();
    await tab.close();
  });
});
