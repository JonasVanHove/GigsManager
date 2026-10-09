import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getVerifiedUserIdFromHeader, findBandByInviteCode, prisma } = vi.hoisted(() => ({
  getVerifiedUserIdFromHeader: vi.fn(),
  findBandByInviteCode: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth-helpers", () => ({ getVerifiedUserIdFromHeader }));
vi.mock("@/lib/band-invites", () => ({ findBandByInviteCode }));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { POST } from "@/app/api/bands/join/route";

const band = { id: "band-1", name: "The Notes", color: "#123456" };

function request(code = "ABC234", token = "token") {
  return new NextRequest("http://localhost/api/bands/join", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

function transactionFor(userId: string, memberId: string) {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: userId,
        email: `${userId}@example.com`,
        name: userId,
      }),
    },
    bandMember: {
      findFirst: vi.fn().mockResolvedValue({ id: memberId, bands: [band.name] }),
      create: vi.fn().mockResolvedValue({ id: memberId, bands: [band.name] }),
      update: vi.fn(),
    },
    gig: { findMany: vi.fn().mockResolvedValue([{ id: "gig-1" }, { id: "gig-2" }]) },
    gigBandMember: { upsert: vi.fn().mockResolvedValue({ id: "link-1" }) },
  };
  prisma.$transaction.mockImplementationOnce(async (callback: (value: typeof tx) => unknown) => callback(tx));
  return tx;
}

describe("multiplayer band joining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findBandByInviteCode.mockResolvedValue(band);
  });

  it("rejects an unauthenticated scan before resolving the invite", async () => {
    getVerifiedUserIdFromHeader.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(findBandByInviteCode).not.toHaveBeenCalled();
  });

  it("uses the authenticated session identity, not a client-supplied user id", async () => {
    getVerifiedUserIdFromHeader.mockResolvedValue("session-user");
    const tx = transactionFor("db-user", "member-1");

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tx.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { supabaseId: "session-user" },
    }));
    expect(tx.gigBandMember.upsert).toHaveBeenCalledTimes(2);
    expect(body.gigsLinked).toBe(2);
  });

  it("is replay-safe through the database upsert contract", async () => {
    getVerifiedUserIdFromHeader.mockResolvedValue("session-user");
    const first = transactionFor("db-user", "member-1");
    await POST(request());
    const second = transactionFor("db-user", "member-1");
    await POST(request());

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(first.gigBandMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { gigId_bandMemberId: { gigId: "gig-1", bandMemberId: "member-1" } },
      update: {},
    }));
    expect(second.gigBandMember.upsert).toHaveBeenCalledTimes(2);
  });

  it("does not append a new band to the user's first unrelated member row", async () => {
    getVerifiedUserIdFromHeader.mockResolvedValue("session-user");
    const tx = transactionFor("db-user", "member-new");
    tx.bandMember.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.bandMember.create.mockImplementation(async () => ({ id: "member-new", bands: [band.name] }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(tx.bandMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "db-user", bands: { has: band.name } },
    }));
    expect(tx.bandMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bands: [band.name], userId: "db-user" }),
    }));
    expect(tx.bandMember.update).not.toHaveBeenCalled();
  });

  it("runs simultaneous distinct sessions inside independent transactions", async () => {
    getVerifiedUserIdFromHeader
      .mockResolvedValueOnce("session-a")
      .mockResolvedValueOnce("session-b");
    const txA = transactionFor("db-a", "member-a");
    const txB = transactionFor("db-b", "member-b");

    const [responseA, responseB] = await Promise.all([POST(request("ABC234", "a")), POST(request("ABC234", "b"))]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(txA.gigBandMember.upsert).toHaveBeenCalledTimes(2);
    expect(txB.gigBandMember.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
