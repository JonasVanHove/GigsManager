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

  it("does not crown every member when they all share the owner's userId", async () => {
    // Regression guard for v1.49.4. In this data model a band's members routinely
    // all carry the owner's userId (they are not separate accounts). Deriving
    // isLeader from `userId === band.userId` therefore crowned the whole roster.
    // Leadership must come from the member's own isLeader flag only.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "alice@example.com", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "bob@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
      { id: "member-c", name: "Cara", email: "cara@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-03"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    const leaders = body.filter((m: { isLeader: boolean }) => m.isLeader);
    expect(leaders.map((m: { id: string }) => m.id)).toEqual(["member-a"]);
    // Ownership is still reported per row for the "you own this band" affordance,
    // but it must not be conflated with the leader crown.
    expect(body.every((m: { isOwner: boolean }) => m.isOwner)).toBe(true);
    expect(body.filter((m: { isLeader: boolean }) => m.isLeader)).toHaveLength(1);
  });

  it("keeps leadership strictly on the isLeader flag regardless of ownership", async () => {
    // A viewer (user-b) is the band owner in this scenario but their own member
    // row is not flagged as leader; only member-c carries the leader flag. The
    // crown must follow the flag, never the owner id.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "b@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-b" },
      { id: "member-c", name: "Cara", email: "c@example.com", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-03"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    expect(body.filter((m: { isLeader: boolean }) => m.isLeader).map((m: { id: string }) => m.id)).toEqual(["member-c"]);
    // Leader sorts first even though another row precedes it in the source array.
    expect(body[0].id).toBe("member-c");
  });

  it("flags the viewer's own row as isCurrentUser so the member sees themselves", async () => {
    // Symptom guard: the signed-in user must be identifiable in the roster.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "b@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-b" },
    ]);

    const body = await (await GET(request, params)).json();

    const self = body.find((m: { id: string }) => m.id === "member-b");
    expect(self.isCurrentUser).toBe(true);
    expect(body.find((m: { id: string }) => m.id === "member-a").isCurrentUser).toBe(false);
  });

  it("passes through each member's stored avatarUrl so profile images render", async () => {
    // Symptom guard: avatars are whatever the roster row stores; the route must
    // not strip or overwrite them.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-b" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "a@example.com", phone: null, notes: null, avatarUrl: "https://cdn.example.com/alice.png", isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "b@example.com", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-b" },
    ]);

    const body = await (await GET(request, params)).json();

    expect(body.find((m: { id: string }) => m.id === "member-a").avatarUrl).toBe("https://cdn.example.com/alice.png");
    expect(body.find((m: { id: string }) => m.id === "member-b").avatarUrl).toBeNull();
  });
});
