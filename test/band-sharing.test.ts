import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above every import, so the mock functions have to be
// hoisted with it.
const { bandMemberFindMany, bandsFindMany } = vi.hoisted(() => ({
  bandMemberFindMany: vi.fn(),
  bandsFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bandMember: { findMany: bandMemberFindMany },
    bands: { findMany: bandsFindMany },
  },
}));

import {
  canEditSharedGig,
  getBandEditPermissions,
  redactGigForBandmate,
} from "@/lib/band-sharing";

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

/**
 * Edit rights are a permission, not a preference: getting them wrong silently
 * lets one bandmate rewrite another band's gigs, or locks a leader out of the
 * band they run.
 */
describe("bandmate edit permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bandMemberFindMany.mockResolvedValue([]);
    bandsFindMany.mockResolvedValue([]);
  });

  async function permissionsFor(
    members: Array<{ bands?: string[] | null; isLeader?: boolean }>,
    openBands: string[] = []
  ) {
    bandMemberFindMany.mockResolvedValue(members);
    bandsFindMany.mockResolvedValue(openBands.map((name) => ({ name })));
    return getBandEditPermissions("user-1");
  }

  it("denies everything to a non-member", async () => {
    const permissions = await permissionsFor([]);
    expect(canEditSharedGig(permissions, "The Notes")).toBe(false);
  });

  it("lets a leader edit their own band's gigs", async () => {
    const permissions = await permissionsFor([
      { bands: ["The Notes"], isLeader: true },
    ]);
    expect(canEditSharedGig(permissions, "The Notes")).toBe(true);
  });

  it("does not let a leader of one band edit another band's gigs", async () => {
    // The regression this guards: leadership used to be a global shortcut, so
    // leading "The Notes" also unlocked gigs shared through "Second Nature".
    const permissions = await permissionsFor([
      { bands: ["The Notes"], isLeader: true },
      { bands: ["Second Nature"], isLeader: false },
    ]);
    expect(canEditSharedGig(permissions, "The Notes")).toBe(true);
    expect(canEditSharedGig(permissions, "Second Nature")).toBe(false);
  });

  it("honours the canMembersEdit switch per band", async () => {
    const permissions = await permissionsFor(
      [
        { bands: ["The Notes", "Second Nature"], isLeader: false },
      ],
      ["Second Nature"]
    );
    expect(canEditSharedGig(permissions, "Second Nature")).toBe(true);
    expect(canEditSharedGig(permissions, "The Notes")).toBe(false);
  });

  it("denies a band the viewer never joined, even when that band is open", async () => {
    const permissions = await permissionsFor(
      [{ bands: ["The Notes"], isLeader: false }],
      ["The Notes", "Second Nature"]
    );
    expect(canEditSharedGig(permissions, "Second Nature")).toBe(false);
  });

  it("denies a gig with no band at all", async () => {
    const permissions = await permissionsFor([
      { bands: ["The Notes"], isLeader: true },
    ]);
    expect(canEditSharedGig(permissions, null)).toBe(false);
    expect(canEditSharedGig(permissions, undefined)).toBe(false);
  });

  it("does not query open bands when the viewer is in none", async () => {
    await permissionsFor([]);
    expect(bandsFindMany).not.toHaveBeenCalled();
  });

  it("tolerates a null or non-array bands column", async () => {
    const permissions = await permissionsFor([
      { bands: null, isLeader: true },
      { bands: ["The Notes"] },
    ]);
    expect(permissions.memberOf.has("The Notes")).toBe(true);
    expect(canEditSharedGig(permissions, "The Notes")).toBe(false);
  });
});