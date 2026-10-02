import { describe, it, expect } from "vitest";
import { redactGigForBandmate } from "@/lib/band-sharing";

/**
 * Bandmates normally see the money; the owner can hide it per gig. Advances
 * are per musician and are never shared. These tests pin that contract down,
 * because a mistake here silently leaks money to another account.
 */
function gig(overrides: Record<string, any> = {}) {
  return {
    id: "gig_1",
    userId: "owner_1",
    eventName: "Jazz at the Park",
    performanceFee: 1500,
    technicalFee: 250,
    managerBonusAmount: 100,
    technicalFeeClaimAmount: 50,
    advanceReceivedByManager: 400,
    advanceToMusicians: 300,
    paymentReceived: true,
    paymentReceivedDate: "2026-01-02",
    bandPaid: true,
    bandPaidDate: "2026-01-03",
    isFinancialHidden: false,
    ...overrides,
  };
}

describe("redactGigForBandmate", () => {
  it("returns the gig untouched for its owner", () => {
    const result = redactGigForBandmate(gig(), { isOwner: true, canEdit: false });
    expect(result.performanceFee).toBe(1500);
    expect(result.advanceReceivedByManager).toBe(400);
    expect(result.sharedWithMe).toBe(false);
    expect(result.canEdit).toBe(true);
  });

  it("keeps financials visible to a bandmate when the owner did not hide them", () => {
    const result = redactGigForBandmate(gig(), { isOwner: false, canEdit: false });
    expect(result.performanceFee).toBe(1500);
    expect(result.technicalFee).toBe(250);
    expect(result.sharedWithMe).toBe(true);
    expect(result.canEdit).toBe(false);
  });

  it("strips financials and payment flags when the gig is marked hidden", () => {
    const result = redactGigForBandmate(gig({ isFinancialHidden: true }), {
      isOwner: false,
      canEdit: true,
    });
    expect(result.performanceFee).toBe(0);
    expect(result.technicalFee).toBe(0);
    expect(result.managerBonusAmount).toBe(0);
    expect(result.technicalFeeClaimAmount).toBe(0);
    expect(result.paymentReceived).toBe(false);
    expect(result.bandPaid).toBe(false);
    // Non-financial metadata stays readable.
    expect(result.eventName).toBe("Jazz at the Park");
  });

  it("never shares advances, even when financials are visible", () => {
    const result = redactGigForBandmate(gig(), { isOwner: false, canEdit: true });
    expect(result.advanceReceivedByManager).toBe(0);
    expect(result.advanceToMusicians).toBe(0);
  });

  it("never shares advances, even when edit is granted", () => {
    const result = redactGigForBandmate(gig(), { isOwner: false, canEdit: true });
    expect(result.canEdit).toBe(true);
    expect(result.advanceToMusicians).toBe(0);
  });

  it("does not mutate the input gig", () => {
    const input = gig();
    redactGigForBandmate(input, { isOwner: false, canEdit: false });
    expect(input.advanceReceivedByManager).toBe(400);
    expect(input.paymentReceived).toBe(true);
  });
});