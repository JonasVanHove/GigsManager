import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getVerifiedUserIdFromHeader, isBandLeaderOrOwner, prisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    user: { findUnique: vi.fn() },
    bands: { findUnique: vi.fn(), update: vi.fn() },
    bandMember: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    gig: { findMany: vi.fn() },
    gigBandMember: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
  };
  mockPrisma.$transaction = vi.fn(async (callback: any) => callback(mockPrisma));

  return {
    getVerifiedUserIdFromHeader: vi.fn(),
    isBandLeaderOrOwner: vi.fn(),
    prisma: mockPrisma,
  };
});

vi.mock("@/lib/auth-helpers", () => ({ getVerifiedUserIdFromHeader }));
vi.mock("@/lib/band-sharing", () => ({ isBandLeaderOrOwner }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn() }));

import { POST as leaveBand, DELETE as leaveBandDelete } from "@/app/api/bands/[id]/leave/route";
import { DELETE as removeMember } from "@/app/api/bands/[id]/members/route";

describe("Band membership management (Leave band & Remove member)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-user-1");
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "user1@example.com" });
    prisma.bands.findUnique.mockResolvedValue({
      id: "band-1",
      name: "The Rolling Stones",
      userId: "owner-user",
    });
    isBandLeaderOrOwner.mockResolvedValue(true);
  });

  describe("POST /api/bands/[id]/leave", () => {
    it("allows a member to leave a band", async () => {
      prisma.bandMember.findMany.mockResolvedValue([
        {
          id: "member-1",
          userId: "user-1",
          bands: ["The Rolling Stones", "The Beatles"],
        },
      ]);
      prisma.gig.findMany.mockResolvedValue([{ id: "gig-1" }, { id: "gig-2" }]);
      prisma.gigBandMember.deleteMany.mockResolvedValue({ count: 2 });
      prisma.bandMember.update.mockResolvedValue({});

      const request = new NextRequest("http://localhost/api/bands/band-1/leave", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      });

      const response = await leaveBand(request, { params: { id: "band-1" } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify member bands was updated without "The Rolling Stones"
      expect(prisma.bandMember.update).toHaveBeenCalledWith({
        where: { id: "member-1" },
        data: { bands: ["The Beatles"] },
      });

      // Verify GigBandMember records for the band's gigs were deleted
      expect(prisma.gigBandMember.deleteMany).toHaveBeenCalledWith({
        where: {
          bandMemberId: "member-1",
          gigId: { in: ["gig-1", "gig-2"] },
        },
      });
    });

    it("rejects leaving if user is not in the band", async () => {
      prisma.bandMember.findMany.mockResolvedValue([]);

      const request = new NextRequest("http://localhost/api/bands/band-1/leave", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      });

      const response = await leaveBand(request, { params: { id: "band-1" } });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("not a member");
    });

    it("transfers band ownership if owner leaves and other members remain", async () => {
      // User is the owner
      prisma.bands.findUnique.mockResolvedValue({
        id: "band-1",
        name: "The Rolling Stones",
        userId: "user-1",
      });

      // User's own member row
      prisma.bandMember.findMany
        .mockResolvedValueOnce([
          { id: "owner-member", userId: "user-1", bands: ["The Rolling Stones"] },
        ])
        // Remaining members
        .mockResolvedValueOnce([
          { id: "member-2", userId: "user-2", isLeader: true, bands: ["The Rolling Stones"] },
        ]);

      prisma.gig.findMany.mockResolvedValue([]);
      prisma.bands.update.mockResolvedValue({});

      const request = new NextRequest("http://localhost/api/bands/band-1/leave", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      });

      const response = await leaveBand(request, { params: { id: "band-1" } });
      expect(response.status).toBe(200);

      // Verify ownership transferred to user-2
      expect(prisma.bands.update).toHaveBeenCalledWith({
        where: { id: "band-1" },
        data: { userId: "user-2" },
      });
    });

    it("deletes the band if sole owner leaves with no other members", async () => {
      prisma.bands.findUnique.mockResolvedValue({
        id: "band-1",
        name: "The Rolling Stones",
        userId: "user-1",
      });

      prisma.bandMember.findMany
        .mockResolvedValueOnce([
          { id: "owner-member", userId: "user-1", bands: ["The Rolling Stones"] },
        ])
        .mockResolvedValueOnce([]); // No remaining members

      prisma.gig.findMany.mockResolvedValue([]);
      prisma.$executeRaw.mockResolvedValue(1);

      const request = new NextRequest("http://localhost/api/bands/band-1/leave", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      });

      const response = await leaveBand(request, { params: { id: "band-1" } });
      expect(response.status).toBe(200);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/bands/[id]/members", () => {
    it("allows a band leader to remove a member", async () => {
      isBandLeaderOrOwner.mockResolvedValue(true);
      prisma.bandMember.findUnique.mockResolvedValue({
        id: "member-to-remove",
        name: "Charlie",
        userId: "user-charlie",
        bands: ["The Rolling Stones"],
      });
      prisma.gig.findMany.mockResolvedValue([{ id: "gig-1" }]);
      prisma.gigBandMember.deleteMany.mockResolvedValue({ count: 1 });
      prisma.bandMember.update.mockResolvedValue({});

      const request = new NextRequest("http://localhost/api/bands/band-1/members?memberId=member-to-remove", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const response = await removeMember(request, { params: { id: "band-1" } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      expect(prisma.bandMember.update).toHaveBeenCalledWith({
        where: { id: "member-to-remove" },
        data: {
          bands: [],
          isLeader: false,
        },
      });
    });

    it("forbids a non-leader from removing other members", async () => {
      isBandLeaderOrOwner.mockResolvedValue(false);
      prisma.bandMember.findUnique.mockResolvedValue({
        id: "member-to-remove",
        name: "Charlie",
        userId: "user-charlie",
        bands: ["The Rolling Stones"],
      });

      const request = new NextRequest("http://localhost/api/bands/band-1/members?memberId=member-to-remove", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const response = await removeMember(request, { params: { id: "band-1" } });
      expect(response.status).toBe(403);
    });

    it("forbids removing the band owner", async () => {
      isBandLeaderOrOwner.mockResolvedValue(true);
      prisma.bands.findUnique.mockResolvedValue({
        id: "band-1",
        name: "The Rolling Stones",
        userId: "owner-user",
      });
      prisma.bandMember.findUnique.mockResolvedValue({
        id: "owner-member",
        name: "Mick",
        userId: "owner-user",
        bands: ["The Rolling Stones"],
      });

      const request = new NextRequest("http://localhost/api/bands/band-1/members?memberId=owner-member", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const response = await removeMember(request, { params: { id: "band-1" } });
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("owner");
    });

    it("returns 404 when target member is not in the band", async () => {
      prisma.bandMember.findUnique.mockResolvedValue({
        id: "other-member",
        name: "David",
        userId: "user-david",
        bands: ["Another Band"],
      });

      const request = new NextRequest("http://localhost/api/bands/band-1/members?memberId=other-member", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const response = await removeMember(request, { params: { id: "band-1" } });
      expect(response.status).toBe(404);
    });
  });
});
