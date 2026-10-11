import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getVerifiedUserIdFromHeader, prisma } = vi.hoisted(() => ({
  getVerifiedUserIdFromHeader: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    bands: { findUnique: vi.fn() },
    bandMember: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({ getVerifiedUserIdFromHeader }));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { GET } from "@/app/api/bands/[id]/members/route";

const request = new NextRequest("http://localhost/api/bands/band-1/members", {
  headers: { Authorization: "Bearer verified" },
});
const params = { params: { id: "band-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  getVerifiedUserIdFromHeader.mockResolvedValue("supabase-b");
  prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
  prisma.bands.findUnique.mockResolvedValue({ id: "band-1", name: "The Notes", userId: "user-a" });
});

describe("GET /api/bands/[id]/members", () => {
  it("rejects an authenticated user who is not in the requested band", async () => {
    prisma.bandMember.findFirst.mockResolvedValue(null);

    const response = await GET(request, params);

    expect(response.status).toBe(403);
    expect(prisma.bandMember.findMany).not.toHaveBeenCalled();
  });

  it("returns the same canonical band roster independent of viewer account", async () => {
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "b@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-b" },
    ]);

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((member: { id: string }) => member.id)).toEqual(["member-a", "member-b"]);
    expect(body.every((member: { claimed: boolean }) => member.claimed)).toBe(true);
    expect(body[0]).not.toHaveProperty("userId");
    expect(prisma.bandMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bands: { has: "The Notes" } },
    }));
  });

  it("marks the band creator as leader for a joining member even when the stored isLeader flag drifted to false", async () => {
    // The invite-joined viewer (user-b) asks for the roster. The creator's row
    // (user-a) exists but its denormalized isLeader flag drifted to false — the
    // kind of legacy/reused-identity state that hides the crown in the UI.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "b@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-b" },
    ]);

    const response = await GET(request, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    const creator = body.find((member: { id: string }) => member.id === "member-a");
    expect(creator.isLeader).toBe(true);
    expect(creator.isOwner).toBe(true);
    // The joining member is not promoted to leader just for asking.
    const joiner = body.find((member: { id: string }) => member.id === "member-b");
    expect(joiner.isLeader).toBe(false);
  });

  it("leads the roster with the owner even when another member carries the stale leader flag", async () => {
    // Sorting must follow the derived owner-leader status, not the raw flag, so
    // the creator's crown stays first regardless of row order from the DB.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-c", name: "Cara", email: "c@example.com", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-03"), userId: "user-c" },
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    expect(body[0].id).toBe("member-a");
    expect(body[0].isLeader).toBe(true);
    expect(body[0].isOwner).toBe(true);
  });
});
