import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const accountA = {
  email: process.env.E2E_ACCOUNT_A_EMAIL || "",
  password: process.env.E2E_ACCOUNT_A_PASSWORD || "",
};
const accountB = {
  email: process.env.E2E_ACCOUNT_B_EMAIL || "",
  password: process.env.E2E_ACCOUNT_B_PASSWORD || "",
};
const accountC = {
  email: process.env.E2E_ACCOUNT_C_EMAIL || "",
  password: process.env.E2E_ACCOUNT_C_PASSWORD || "",
};

const isolatedMutationRun =
  process.env.E2E_ALLOW_MUTATIONS === "1" &&
  process.env.E2E_ISOLATED_DATABASE === "1" &&
  Boolean(accountA.email && accountA.password && accountB.email && accountB.password && accountC.email && accountC.password);

test.describe("real two-account multiplayer acceptance", () => {
  test.skip(
    !isolatedMutationRun,
    "Requires explicit isolated test configuration: E2E_ALLOW_MUTATIONS=1, E2E_ISOLATED_DATABASE=1, and accounts A/B/C."
  );
  test.describe.configure({ timeout: 120_000, mode: "serial" });

  async function signIn(context: BrowserContext, credentials: { email: string; password: string }) {
    const page = await context.newPage();
    await page.goto("/");
    const emailInput = page.locator("#login-email");
    if (!(await emailInput.isVisible().catch(() => false))) {
      await page.getByText("Log In", { exact: true }).first().click();
    }
    await emailInput.fill(credentials.email);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/app**", { timeout: 60_000 });
    return page;
  }

  async function loadBands(page: Page) {
    await page.goto("/app?tab=bands");
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/bands") && response.request().method() === "GET"
    );
    await page.reload();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as Array<{ id: string; name: string; isOwner?: boolean }>;
  }

  async function loadRoster(page: Page, bandId: string) {
    return page.evaluate(async (id) => {
      const storageKeys = Object.keys(localStorage).filter((key) => key.startsWith("sb-"));
      let accessToken: string | null = null;
      for (const key of storageKeys) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "null");
          if (value?.access_token) {
            accessToken = value.access_token;
            break;
          }
        } catch {
          // Ignore non-session Supabase storage entries.
        }
      }
      if (!accessToken) throw new Error("No browser Supabase access token available");
      const response = await fetch(`/api/bands/${id}/members`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Roster request failed: ${response.status}`);
      return (await response.json()) as Array<{ id: string; name: string; email: string | null; claimed: boolean }>;
    }, bandId);
  }

  async function loadGigs(page: Page) {
    return page.evaluate(async () => {
      const storageKeys = Object.keys(localStorage).filter((key) => key.startsWith("sb-"));
      let accessToken: string | null = null;
      for (const key of storageKeys) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "null");
          if (value?.access_token) {
            accessToken = value.access_token;
            break;
          }
        } catch {
          // Ignore non-session Supabase storage entries.
        }
      }
      if (!accessToken) throw new Error("No browser Supabase access token available");
      const response = await fetch("/api/gigs", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-store",
        },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Gig list request failed: ${response.status}`);
      return (await response.json()) as { data: Array<Record<string, any>> };
    });
  }

  test("keeps identity, roster, gig access, and account isolation consistent", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();
    const pageA = await signIn(contextA, accountA);
    const pageB = await signIn(contextB, accountB);
    const pageC = await signIn(contextC, accountC);

    const bandName = `E2E Multiplayer ${Date.now()}`;
    try {
      const bandsTabA = await loadBands(pageA);
      const addBand = pageA.getByRole("button", { name: /add band|band toevoegen|nieuwe band/i });
      await addBand.click();
      await pageA.locator('form input[type="text"]').first().fill(bandName);
      const createBandResponse = pageA.waitForResponse(
        (response) => response.url().endsWith("/api/bands") && response.request().method() === "POST"
      );
      await pageA.locator("form").filter({ has: pageA.locator('input[type="text"]') }).getByRole("button", { name: /save|opslaan/i }).click();
      expect((await createBandResponse).ok()).toBeTruthy();

      const bandsAfterCreate = await loadBands(pageA);
      const createdBand = bandsAfterCreate.find((band) => band.name === bandName);
      expect(createdBand).toBeDefined();
      expect(createdBand?.isOwner).toBe(true);
      expect(bandsTabA.some((band) => band.name === bandName)).toBe(false);

      const bandCard = pageA
        .getByText(bandName, { exact: true })
        .locator("xpath=ancestor::div[.//button[@data-testid='band-invite-button']][1]");
      const inviteButton = bandCard.getByTestId("band-invite-button");
      await inviteButton.click();
      const codeElement = pageA.getByTestId("band-invite-code");
      await expect(codeElement).toBeVisible({ timeout: 30_000 });
      const inviteCode = (await codeElement.textContent())?.trim() || "";
      expect(inviteCode).toMatch(/^[A-Z2-9]{6}$/);

      const gigName = `E2E Shared Gig ${Date.now()}`;
      await pageA.goto("/app");
      await pageA.getByTestId("add-performance-button").click();
      const gigForm = pageA.locator("#gig-form");
      await expect(gigForm).toBeVisible();
      await pageA.getByPlaceholder("e.g. Jazz at the Park").fill(gigName);
      await gigForm.locator('input[type="date"]').first().fill("2030-06-15");
      await gigForm.locator("select").first().selectOption({ label: bandName });
      await pageA.getByPlaceholder("e.g. The Blue Notes").fill(bandName);
      await gigForm.locator('input[type="number"]').first().fill("2");
      const createGigResponse = pageA.waitForResponse(
        (response) => response.url().endsWith("/api/gigs") && response.request().method() === "POST"
      );
      await pageA.getByRole("button", { name: "Save", exact: true }).click();
      const createdGigResponse = await createGigResponse;
      expect(createdGigResponse.ok()).toBeTruthy();
      const createdGigPayload = await createdGigResponse.json() as { id: string; eventName: string; bandId: string | null };
      expect(createdGigPayload).toMatchObject({ eventName: gigName, bandId: createdBand!.id });
      await expect(gigForm).toBeHidden({ timeout: 30_000 });

      const gigsAfterCreate = await loadGigs(pageA);
      const createdGig = gigsAfterCreate.data.find((gig) => gig.id === createdGigPayload.id);
      expect(createdGig).toMatchObject({ eventName: gigName, bandId: createdBand!.id });

      const previewResponse = pageB.waitForResponse(
        (response) => response.url().includes("/api/bands/invite?code=") && response.request().method() === "GET"
      );
      await pageB.goto(`/join?code=${inviteCode}`);
      const preview = await previewResponse;
      expect(preview.ok()).toBeTruthy();
      await expect(pageB.getByTestId("join-preview")).toContainText(bandName);

      const joinResponse = pageB.waitForResponse(
        (response) => response.url().endsWith("/api/bands/join") && response.request().method() === "POST"
      );
      await pageB.getByTestId("join-submit").click();
      const joined = await joinResponse;
      expect(joined.ok()).toBeTruthy();
      await pageB.waitForURL("**/app**", { timeout: 60_000 });

      const gigsForB = await loadGigs(pageB);
      expect(gigsForB.data.find((gig) => gig.id === createdGig!.id)?.eventName).toBe(gigName);
      await expect(pageB.getByTestId("gig-card").filter({ hasText: gigName })).toBeVisible();

      const bandsAfterJoinB = await loadBands(pageB);
      const joinedBandB = bandsAfterJoinB.find((band) => band.id === createdBand?.id);
      expect(joinedBandB).toBeDefined();
      expect(joinedBandB?.isOwner).toBe(false);

      const [rosterA, rosterB] = await Promise.all([
        loadRoster(pageA, createdBand!.id),
        loadRoster(pageB, createdBand!.id),
      ]);
      expect(rosterA.map((member) => member.id)).toEqual(rosterB.map((member) => member.id));
      expect(rosterA.map((member) => member.email).sort()).toEqual(rosterB.map((member) => member.email).sort());
      expect(rosterB.filter((member) => member.email === accountB.email)).toHaveLength(1);
      expect(rosterB.find((member) => member.email === accountB.email)?.claimed).toBe(true);
      expect(rosterA.some((member) => member.email === accountC.email)).toBe(false);

      await pageA.goto("/app");
      const gigCardA = pageA.getByTestId("gig-card").filter({ hasText: gigName });
      await gigCardA.getByTestId("edit-performance-button").click();
      const editForm = pageA.locator("#gig-form");
      await editForm.getByTestId("gig-form-tab-logistics").click();
      await pageA.getByPlaceholder("Ancienne Belgique").fill("Updated Shared Venue");
      await pageA.getByPlaceholder("Boulevard Anspach 110, Brussel").fill("Updated Shared Address");
      const updateGigResponse = pageA.waitForResponse(
        (response) => response.url().endsWith(`/api/gigs/${createdGig!.id}`) && response.request().method() === "PUT"
      );
      await pageA.getByRole("button", { name: "Save Changes", exact: true }).click();
      const updatedGigPayload = await updateGigResponse;
      expect(updatedGigPayload.ok()).toBeTruthy();
      const updatedGigBody = await updatedGigPayload.json() as { venueName: string | null; venueLocation: string | null };
      expect(updatedGigBody).toMatchObject({ venueName: "Updated Shared Venue", venueLocation: "Updated Shared Address" });
      await expect(editForm).toBeHidden({ timeout: 30_000 });

      await pageB.reload();
      const gigsAfterUpdateB = await loadGigs(pageB);
      const updatedGigForB = gigsAfterUpdateB.data.find((gig) => gig.id === createdGig!.id);
      expect(updatedGigForB).toMatchObject({
        eventName: gigName,
        venueName: "Updated Shared Venue",
        venueLocation: "Updated Shared Address",
      });
      await pageB.goto("/app");
      await expect(pageB.getByTestId("gig-card").filter({ hasText: gigName })).toBeVisible();

      await pageA.reload();
      await pageB.reload();
      const [rosterAfterRefreshA, rosterAfterRefreshB] = await Promise.all([
        loadRoster(pageA, createdBand!.id),
        loadRoster(pageB, createdBand!.id),
      ]);
      expect(rosterAfterRefreshA.map((member) => member.id)).toEqual(rosterA.map((member) => member.id));
      expect(rosterAfterRefreshB.map((member) => member.id)).toEqual(rosterB.map((member) => member.id));

      await expect(pageC.getByTestId("join-code-input")).toHaveCount(0);
      const bandsC = await loadBands(pageC);
      expect(bandsC.some((band) => band.id === createdBand?.id)).toBe(false);
      await expect(pageC.getByText(bandName)).toHaveCount(0);
      const gigsForC = await loadGigs(pageC);
      expect(gigsForC.data.some((gig) => gig.id === createdGig!.id)).toBe(false);
      await expect(pageC.getByTestId("gig-card").filter({ hasText: gigName })).toHaveCount(0);
    } finally {
      await Promise.all(
        [contextA, contextB, contextC].map((context) => context.close().catch(() => undefined))
      );
    }
  });
});
