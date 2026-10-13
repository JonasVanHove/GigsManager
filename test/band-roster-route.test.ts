import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getVerifiedUserIdFromHeader, prisma, getSupabaseAdminMock, listUsersMock } =
  vi.hoisted(() => ({
    getVerifiedUserIdFromHeader: vi.fn(),
    listUsersMock: vi.fn(),
    getSupabaseAdminMock: vi.fn(),
    prisma: {
      user: { findUnique: vi.fn() },
      bands: { findUnique: vi.fn() },
      bandMember: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  }));

vi.mock("@/lib/auth-helpers", () => ({ getVerifiedUserIdFromHeader }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: getSupabaseAdminMock }));

import { GET } from "@/app/api/bands/[id]/members/route";
import { clearProfileAvatarCache } from "@/lib/roster-profile-avatars";

const request = new NextRequest("http://localhost/api/bands/band-1/members", {
  headers: { Authorization: "Bearer verified" },
});
const params = { params: { id: "band-1" } };

/**
 * The route resolves two users: the viewer (by supabaseId) and the band owner
 * (by bands.userId). Configure the user.findUnique mock to answer both from a
 * single { supabaseId, id, email, name } map keyed by internal id.
 */
function setUsers(
  accounts: Record<string, { supabaseId?: string; id: string; email: string; name?: string }>
) {
  const bySupabase = Object.values(accounts).filter((a) => a.supabaseId);
  const viewer = bySupabase[0];
  prisma.user.findUnique.mockImplementation(({ where }: any) => {
    if (where?.supabaseId) {
      return Promise.resolve(bySupabase.find((a) => a.supabaseId === where.supabaseId) ?? null);
    }
    if (where?.id) {
      return Promise.resolve(accounts[where.id] ?? null);
    }
    return Promise.resolve(null);
  });
  return viewer;
}

const OWNER = { supabaseId: "supabase-owner", id: "user-a", email: "owner@band.be", name: "Owner One" };
const JOINER = { supabaseId: "supabase-joiner", id: "user-b", email: "joiner@band.be", name: "Joiner Two" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: owner "user-a" owns the band; owner is the signed-in viewer.
  getVerifiedUserIdFromHeader.mockResolvedValue("supabase-owner");
  setUsers({ "user-a": OWNER, "user-b": JOINER });
  prisma.bands.findUnique.mockResolvedValue({ id: "band-1", name: "The Notes", userId: "user-a" });
  // Account-profile avatar join: fresh cache and a configurable admin client.
  clearProfileAvatarCache();
  getSupabaseAdminMock.mockImplementation(() => ({
    auth: { admin: { listUsers: listUsersMock } },
  }));
  listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
});


describe("GET /api/bands/[id]/members", () => {
  it("rejects an authenticated user who is not in the requested band", async () => {
    // A third account that is neither the owner nor a member.
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    prisma.bandMember.findFirst.mockResolvedValue(null);

    const response = await GET(request, params);

    expect(response.status).toBe(403);
    expect(prisma.bandMember.findMany).not.toHaveBeenCalled();
  });

  it("returns the same canonical band roster independent of viewer account", async () => {
    // Both members share the owner's userId and neither matches the owner's
    // e-mail, so the owner is projected. The membership set must be identical
    // no matter who asks, and userId never leaks to the client.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-a" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-a", name: "Alice", email: "alice@band.be", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-b", name: "Bob", email: "bob@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
    ]);

    const ownerView = await (await GET(request, params)).json();

    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    const joinerView = await (await GET(request, params)).json();

    expect(ownerView.map((m: { id: string }) => m.id).sort()).toEqual(
      joinerView.map((m: { id: string }) => m.id).sort()
    );
    expect(ownerView.filter((m: { isOwner: boolean }) => m.isOwner)).toHaveLength(1);
    expect(joinerView.filter((m: { isOwner: boolean }) => m.isOwner)).toHaveLength(1);
    expect(ownerView.every((m: object) => !("userId" in m))).toBe(true);
    expect(prisma.bandMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bands: { has: "The Notes" } },
    }));
  });

  it("does not crown every member when they all share the owner's userId", async () => {
    // Regression guard for v1.49.4. In this data model a band's members routinely
    // all carry the owner's userId (they are not separate accounts), and none
    // carries the owner's e-mail. Only the explicitly promoted member is a leader;
    // the owner is projected separately as the single owner+leader.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-2" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-2", name: "Master", email: "master@band.be", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
      { id: "member-3", name: "Zinnia", email: "zinnia@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-03"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    const leaders = body.filter((m: { isLeader: boolean }) => m.isLeader);
    // Exactly two leaders: the projected owner + the explicitly promoted member.
    expect(leaders.map((m: { id: string }) => m.id).sort()).toEqual(["member-2", "owner-user-a"]);
    // Only the owner carries isOwner; the promoted member is a leader, not owner.
    expect(body.filter((m: { isOwner: boolean }) => m.isOwner)).toHaveLength(1);
    expect(body.find((m: { id: string }) => m.id === "owner-user-a").isOwner).toBe(true);
  });

  it("owner view: owner appears once as leader + owner + current user", async () => {
    // The signed-in viewer IS the band owner. They must see themselves exactly
    // once, crowned, and must NOT be flagged on any virtual member that merely
    // shares their userId.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-1" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-2", name: "Zinnia", email: "zinnia@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    const owners = body.filter((m: { isOwner: boolean }) => m.isOwner);
    expect(owners).toHaveLength(1);
    expect(owners[0].isLeader).toBe(true);
    const current = body.filter((m: { isCurrentUser: boolean }) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].isOwner).toBe(true);
    expect(body.find((m: { id: string }) => m.id === "member-1").isCurrentUser).toBe(false);
  });

  it("joiner view: joiner sees themselves as a plain member and the owner as leader", async () => {
    // The signed-in viewer is an invite-joined member (user-b), not the owner.
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-4" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-4", name: "Joiner Two", email: "joiner@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-04"), userId: "user-b" },
    ]);

    const body = await (await GET(request, params)).json();

    const current = body.filter((m: { isCurrentUser: boolean }) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("member-4");
    expect(current[0].isOwner).toBe(false);
    expect(current[0].isLeader).toBe(false);
    const owners = body.filter((m: { isOwner: boolean }) => m.isOwner);
    expect(owners).toHaveLength(1);
    expect(owners[0].isLeader).toBe(true);
    expect(owners[0].isCurrentUser).toBe(false);
  });

  it("a joiner receives the whole band roster, never account-scoped rows", async () => {
    // Regression: the roster query must be scoped to the band only (every
    // BandMember row containing the band name). Filtering it by the viewer's
    // userId would hand a joiner just their own rows — they would see only
    // themselves instead of the owner and the rest of the lineup.
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-4" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-2", name: "Master", email: "master@band.be", phone: null, notes: null, avatarUrl: null, isLeader: true, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
      { id: "member-4", name: "Joiner Two", email: "joiner@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-04"), userId: "user-b" },
    ]);

    const body = await (await GET(request, params)).json();

    // The band-scoped query carries no viewer filter whatsoever.
    expect(prisma.bandMember.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.bandMember.findMany.mock.calls[0][0]?.where).toEqual({
      bands: { has: "The Notes" },
    });

    // The joiner sees the owner (projected), the other members and themselves
    // — the array is never reduced to the joiner alone.
    const ids = body.map((m: { id: string }) => m.id);
    expect(ids).toContain("owner-user-a");
    expect(ids).toContain("member-1");
    expect(ids).toContain("member-2");
    expect(ids).toContain("member-4");
    expect(ids.length).toBeGreaterThan(1);
    // Only the joiner's own row is flagged as the current user.
    const current = body.filter((m: { isCurrentUser: boolean }) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("member-4");
  });

  it("reuses the owner's real member row (e-mail match) instead of duplicating", async () => {
    // When the owner DOES have a persisted member row carrying their own e-mail,
    // that row becomes the owner entry — no projected duplicate is added.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-owner" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-owner", name: "Owner One", email: "owner@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-02"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    const owners = body.filter((m: { isOwner: boolean }) => m.isOwner);
    expect(owners).toHaveLength(1);
    expect(owners[0].id).toBe("member-owner");
    expect(owners[0].isLeader).toBe(true); // promoted even though flag was false
    expect(body.some((m: { id: string }) => m.id.startsWith("owner-"))).toBe(false);
  });

  it("passes through each member's stored avatarUrl so profile images render", async () => {
    // Symptom guard: avatars are whatever the roster row stores; the route must
    // not strip or overwrite them.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-1" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: "https://cdn.example.com/elias.png", isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
    ]);

    const body = await (await GET(request, params)).json();

    expect(body.find((m: { id: string }) => m.id === "member-1").avatarUrl).toBe("https://cdn.example.com/elias.png");
  });

  it("joiner view: sees owner, other members and self exactly once — with linked-account avatars", async () => {
    // Symptom guard: a joiner gets the full roster (owner + every member +
    // themselves, no duplicate rows), and each member with a linked account
    // shows that account's Supabase profile image.
    getVerifiedUserIdFromHeader.mockResolvedValue("supabase-joiner");
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-4" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
      { id: "member-4", name: "Joiner Two", email: "joiner@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-04"), userId: "user-b" },
    ]);
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          { id: "supabase-owner", email: "owner@band.be", user_metadata: { avatar_url: "https://cdn.example.com/owner.png" } },
          { id: "supabase-joiner", email: "joiner@band.be", user_metadata: { avatar_url: "https://cdn.example.com/joiner.png" } },
          // Auth e-mail casing differs from the member row — normalisation must match.
          { id: "supabase-elias", email: "Elias@Band.be", user_metadata: { avatar_url: "https://cdn.example.com/elias-profile.png" } },
        ],
      },
      error: null,
    });

    const body = await (await GET(request, params)).json();

    // Owner (projected) + two members: every roster row appears exactly once.
    expect(body).toHaveLength(3);
    expect(new Set(body.map((m: { id: string }) => m.id)).size).toBe(3);

    const owner = body.find((m: { isOwner: boolean }) => m.isOwner);
    expect(owner.email).toBe("owner@band.be");
    expect(owner.avatarUrl).toBe("https://cdn.example.com/owner.png");

    // The joiner sees the other members with their profile images …
    expect(body.find((m: { id: string }) => m.id === "member-1").avatarUrl).toBe(
      "https://cdn.example.com/elias-profile.png"
    );
    // … and themselves as the single current user, with their own avatar.
    const current = body.filter((m: { isCurrentUser: boolean }) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("member-4");
    expect(current[0].avatarUrl).toBe("https://cdn.example.com/joiner.png");
    expect(current[0].isOwner).toBe(false);
    // The account join ran exactly once: the second read hits the avatar cache.
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a member's own stored avatarUrl over the linked profile image", async () => {
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-1" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: "https://cdn.example.com/custom-elias.png", isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
    ]);
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "supabase-elias", email: "elias@band.be", user_metadata: { avatar_url: "https://cdn.example.com/profile-elias.png" } }] },
      error: null,
    });

    const body = await (await GET(request, params)).json();

    expect(body.find((m: { id: string }) => m.id === "member-1").avatarUrl).toBe(
      "https://cdn.example.com/custom-elias.png"
    );
  });

  it("does not leak the owner's profile avatar onto virtual members sharing the owner's userId", async () => {
    // Virtual rows carry bands.userId but their own e-mail; only e-mail may
    // match profile avatars, otherwise the owner's photo shows on every member.
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-virtual" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-virtual", name: "Session Musician", email: "session@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
    ]);
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "supabase-owner", email: "owner@band.be", user_metadata: { avatar_url: "https://cdn.example.com/owner.png" } }] },
      error: null,
    });

    const body = await (await GET(request, params)).json();

    const virtualMember = body.find((m: { id: string }) => m.id === "member-virtual");
    expect(virtualMember.avatarUrl).toBeNull();
    // The projected owner still receives their own profile image.
    const owner = body.find((m: { isOwner: boolean }) => m.isOwner);
    expect(owner.avatarUrl).toBe("https://cdn.example.com/owner.png");
  });

  it("still serves the roster when the Supabase admin API is unavailable", async () => {
    // Stub client without an admin API (missing service-role key): the account
    // join degrades to "no profile avatars" — the roster itself must not fail.
    getSupabaseAdminMock.mockReturnValue({
      auth: { getUser: async () => ({ data: null, error: { message: "not configured" } }) },
    });
    prisma.bandMember.findFirst.mockResolvedValue({ id: "member-1" });
    prisma.bandMember.findMany.mockResolvedValue([
      { id: "member-1", name: "Elias", email: "elias@band.be", phone: null, notes: null, avatarUrl: null, isLeader: false, bands: ["The Notes"], updatedAt: new Date("2026-01-01"), userId: "user-a" },
    ]);

    const response = await GET(request, params);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.find((m: { id: string }) => m.id === "member-1").avatarUrl).toBeNull();
  });
});
