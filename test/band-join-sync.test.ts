import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getVerifiedUserIdFromHeader, prisma, findBandByInviteCodeMock } =
  vi.hoisted(() => ({
    getVerifiedUserIdFromHeader: vi.fn(),
    findBandByInviteCodeMock: vi.fn(),
    prisma: {
      user: { findUnique: vi.fn() },
      bandMember: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      gig: { findMany: vi.fn() },
      gigBandMember: { upsert: vi.fn() },
      $transaction: vi.fn(),
    },
  }));

vi.mock("@/lib/auth-helpers", () => ({ getVerifiedUserIdFromHeader }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("@/lib/band-invites", () => ({ findBandByInviteCode: findBandByInviteCodeMock }));

import { POST as joinBand } from "@/app/api/bands/join/route";

const OWNER = { supabaseId: "supabase-owner", id: "user-a", email: "owner@band.be", name: "Owner One" };
const JOINER = { supabaseId: "supabase-joiner", id: "user-b", email: "joiner@band.be", name: "Joiner Two" };

beforeEach(() => {
  vi.clearAllMocks();
});

function setUsers(
  accounts: Record<string, { supabaseId?: string; id: string; email: string; name?: string }>
) {
  const bySupabase = Object.values(accounts).filter((a) => a.supabaseId);
  prisma.user.findUnique.mockImplementation(({ where }: any) => {
    if (where?.supabaseId) {
      return Promise.resolve(bySupabase.find((a) => a.supabaseId === where.supabaseId) ?? null);
    }
    if (where?.id) {
      return Promise.resolve(accounts[where.id] ?? null);
    }
    return Promise.resolve(null);
  });
}

describe("Band join -> cache invalidation", () => {
  it("invalidates cache for joiner and owner when joining a band", async () => {
    // Setup the join route with a successful transaction
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    setUsers({ "user-a": OWNER, "user-b": JOINER });

    // Mock findBandByInviteCode to return a band
    findBandByInviteCodeMock.mockResolvedValue({
      id: "band-1",
      name: "The Notes",
      userId: "user-a",
      color: "#bfdbfe",
    });

    // Mock the transaction to succeed
    prisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        user: { findUnique: prisma.user.findUnique },
        bandMember: { findFirst: prisma.bandMember.findFirst, create: prisma.bandMember.create, update: prisma.bandMember.update },
        gig: { findMany: prisma.gig.findMany },
        gigBandMember: { upsert: prisma.gigBandMember.upsert },
      });
    });

    prisma.bandMember.findFirst.mockResolvedValue(null);
    prisma.bandMember.create.mockResolvedValue({
      id: "member-joiner",
      name: "Joiner Two",
      email: "joiner@band.be",
      userId: "user-b",
      bands: ["The Notes"],
      isLeader: false,
    });
    prisma.gig.findMany.mockResolvedValue([]);
    prisma.gigBandMember.upsert.mockResolvedValue({});

    const joinRequest = new NextRequest("http://localhost/api/bands/join", {
      method: "POST",
      headers: { Authorization: "Bearer verified", "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABC123" }),
    });
    const joinResponse = await joinBand(joinRequest);
    expect(joinResponse.status).toBe(200);

    // Verify cache was invalidated for both joiner and owner
    const { invalidateCache } = await import("@/lib/cache");
    expect(invalidateCache).toHaveBeenCalledWith("user-b:band-members");
    expect(invalidateCache).toHaveBeenCalledWith("user-b:gigs");
    expect(invalidateCache).toHaveBeenCalledWith("user-a:band-members");
    expect(invalidateCache).toHaveBeenCalledWith("user-a:gigs");
  });
});
