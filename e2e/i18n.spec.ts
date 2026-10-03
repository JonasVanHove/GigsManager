import { test, expect } from '@playwright/test';
import { openAppTab } from './helpers/app';

/**
 * Language switching between English and Dutch.
 *
 * v1.36.0: this loaded `/` (the public landing page) and expected the profile
 * menu and settings modal to be there, so every test died waiting for
 * `button[title="Profile & Settings"]`. Settings live behind the dashboard.
 *
 * Labels are localised, so assertions target the `<option value>` of the
 * language select and the values it persists, not the rendered wording.
 */

const LANGUAGE_SELECT = 'select';

/**
 * Asserts the Overview tab label in the given language.
 *
 * Asserted on text rather than visibility: the desktop tab strip is collapsed
 * behind the mobile shell at phone widths, so the label exists but is hidden.
 * `nav-tab-gigs` is a stable testid, unlike the label itself.
 */
async function expectOverviewLabel(
  tab: import('@playwright/test').Page,
  pattern: RegExp
) {
  const tabButton = tab.getByTestId('nav-tab-gigs').first();
  await expect(tabButton).toBeAttached({ timeout: 30_000 });
  await expect(tabButton).toHaveText(pattern, { timeout: 30_000 });
}

test.describe('i18n Language Switching (NL/EN)', () => {
  test.describe.configure({ timeout: 90_000 });

  /** Signs in and opens Settings through the profile menu. */
  async function openSettings(page: import('@playwright/test').Page) {
    const tab = await openAppTab(page, 'gigs');
    await tab
      .getByText(/loading performances/i)
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => undefined);

    await tab.locator('button[title="Profile & Settings"]').click();

    // The menu entry opens the modal; the menu itself is not the settings UI.
    const settingsEntry = tab.locator('button', { hasText: /instellingen|settings/i }).first();
    await settingsEntry.waitFor({ state: 'visible', timeout: 30_000 });
    await settingsEntry.click();

    const select = tab.locator('select:has(option[value="nl"])').first();
    await select.waitFor({ state: 'visible', timeout: 30_000 });
    return { tab, select };
  }

  /** Picks a language and saves. */
  async function setLanguage(
    tab: import('@playwright/test').Page,
    select: import('@playwright/test').Locator,
    value: 'system' | 'en' | 'nl'
  ) {
    await select.selectOption(value);
    const save = tab.locator('button', { hasText: /opslaan|save/i }).first();
    await save.click();
    // The PUT round-trip plus the auth token can exceed the 5s default.
    await select.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /** Reopens Settings on an already-loaded dashboard. */
  async function reopenSettings(tab: import('@playwright/test').Page) {
    await tab.locator('button[title="Profile & Settings"]').click();
    const entry = tab.locator('button', { hasText: /instellingen|settings/i }).first();
    await entry.waitFor({ state: 'visible', timeout: 30_000 });
    await entry.click();

    const select = tab.locator('select:has(option[value="nl"])').first();
    await select.waitFor({ state: 'visible', timeout: 30_000 });
    return select;
  }

  test('should offer a language setting with the three supported options', async ({ page }) => {
    const { tab, select } = await openSettings(page);

    await expect(select.locator('option[value="system"]')).toHaveCount(1);
    await expect(select.locator('option[value="en"]')).toHaveCount(1);
    await expect(select.locator('option[value="nl"]')).toHaveCount(1);
    await tab.close();
  });

  test('should switch the interface to Dutch', async ({ page }) => {
    const { tab, select } = await openSettings(page);

    await setLanguage(tab, select, 'nl');

    // The Dutch tab label replaces the English one.
    await expectOverviewLabel(tab, /overzicht/i);
    await tab.close();
  });

  test('should switch back to English', async ({ page }) => {
    const { tab, select } = await openSettings(page);

    await setLanguage(tab, select, 'nl');
    // Saving closes the modal, so Settings has to be opened again.
    const reopened = await reopenSettings(tab);
    await setLanguage(tab, reopened, 'en');

    await expectOverviewLabel(tab, /overview/i);
    await tab.close();
  });

  test('should persist the language across a reload', async ({ page }) => {
    const { tab, select } = await openSettings(page);

    await setLanguage(tab, select, 'nl');
    await tab.reload();
    await tab.getByTestId('gig-card').first().waitFor({ state: 'visible', timeout: 60_000 });

    // Still Dutch after a full reload, i.e. it was persisted server-side.
    await expectOverviewLabel(tab, /overzicht/i);

    // Reset so the demo account is left in its default state.
    const reopened = await reopenSettings(tab);
    await setLanguage(tab, reopened, 'en');
    await tab.close();
  });

  test('should accept the system language option without error', async ({ page }) => {
    const { tab, select } = await openSettings(page);

    await setLanguage(tab, select, 'system');

    // Whatever the browser resolves to, the dashboard must still render.
    await expect(tab.getByTestId('gig-card').first()).toBeVisible({ timeout: 30_000 });

    const reopened = await reopenSettings(tab);
    await setLanguage(tab, reopened, 'en');
    await tab.close();
  });

  test('should render the Songs tab in the selected language', async ({ page }) => {
    const { tab, select } = await openSettings(page);
    await setLanguage(tab, select, 'nl');

    await tab.getByTestId('mobile-nav-tab-bands').isVisible().catch(() => false);
    await tab.goto('/app?tab=songs');
    await tab.getByTestId('songs-container').waitFor({ state: 'visible', timeout: 60_000 });

    await expect(tab.locator('button', { hasText: /nieuw nummer|new song/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    await tab.close();
  });

  test('should render the Bands tab in the selected language', async ({ page }) => {
    const { tab, select } = await openSettings(page);
    await setLanguage(tab, select, 'nl');

    await tab.goto('/app?tab=bands');
    await tab.getByTestId('band-invite-button').first().waitFor({ state: 'visible', timeout: 60_000 });

    // The invite button is one of the localised strings on this tab.
    await expect(
      tab.getByTestId('band-invite-button').first()
    ).toHaveText(/uitnodigings|invite/i);
    await tab.close();
  });
});
