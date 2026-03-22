import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_LINK_VISIBILITY,
  generateShareToken,
  normalizeShareLinkVisibility,
} from "./share-links";

describe("share-links", () => {
  it("normalizes visibility with defaults", () => {
    const normalized = normalizeShareLinkVisibility({
      showEventName: false,
      showNotes: true,
    });

    expect(normalized.showEventName).toBe(false);
    expect(normalized.showNotes).toBe(true);
    expect(normalized.showGigDate).toBe(DEFAULT_SHARE_LINK_VISIBILITY.showGigDate);
  });

  it("hides all financial fields when hideAllFinancialInformation is true", () => {
    const normalized = normalizeShareLinkVisibility({
      hideAllFinancialInformation: true,
      showPerformanceFee: true,
      showPerMusicianShare: true,
      showManagerEarnings: true,
      showManagerBonus: true,
      showTechnicalFee: true,
      showTotalCost: true,
    });

    expect(normalized.hideAllFinancialInformation).toBe(true);
    expect(normalized.showPerformanceFee).toBe(false);
    expect(normalized.showPerMusicianShare).toBe(false);
    expect(normalized.showManagerEarnings).toBe(false);
    expect(normalized.showManagerBonus).toBe(false);
    expect(normalized.showTechnicalFee).toBe(false);
    expect(normalized.showTotalCost).toBe(false);
  });

  it("generates url-safe tokens with reasonable minimum length", () => {
    const token = generateShareToken(24);

    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
