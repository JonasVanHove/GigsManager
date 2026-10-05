import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * v1.47.0 — gig chat API: auth, access control, unread accounting and message
 * posting. Prisma and the Supabase-backed auth guard are mocked the same way
 * the other route tests do it; `findSharedGigIds` runs for real on top of the
 * prisma mock so the owner/bandmate rule is exercised end to end.
 */

const requireAuthMock = vi.fn();

const gigFindUnique = vi.fn();
const gigFindMany = vi.fn();
const gigMessageFindMany = vi.fn();
const gigMessageCount = vi.fn();
const gigMessageCreate = vi.fn();
const gigChatReadFindUnique = vi.fn();
const gigChatReadFindMany = vi.fn();
const gigChatReadUpsert = vi.fn();
const bandMemberFindMany = vi.fn();
const bandMemberFindFirst = vi.fn();
const bandMemberCreate = vi.fn();
const gigBandMemberFindMany = vi.fn();
const gigBandMemberFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gig: { findUnique: gigFindUnique, findMany: gigFindMany },
    gigMessage: {
      findMany: gigMessageFindMany,
      count: gigMessageCount,
      create: gigMessageCreate,
    },
    gigChatRead: {
      findUnique: gigChatReadFindUnique,
      findMany: gigChatReadFindMany,
      upsert: gigChatReadUpsert,
    },
    bandMember: {
      findMany: bandMemberFindMany,
      findFirst: bandMemberFindFirst,
      create: bandMemberCreate,
    },
    gigBandMember: {
      findMany: gigBandMemberFindMany,
      findFirst: gigBandMemberFindFirst,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: requireAuthMock,
  getOrCreateUser: vi.fn(),
  getUserIdFromHeader: vi.fn(),
  requireOwnedGigOr404: vi.fn(),
}));

const OWNER = { id: "owner-1", email: "owner@example.com", name: "Owner" };
const BANDMATE = { id: "user-2", email: "mate@example.com", name: "Mate" };

function authedRequest(url: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: { Authorization: "Bearer token", ...(init?.headers ?? {}) },
  }) as any;
}

function params(id = "gig-1") {
  return { params: { id } };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: OWNER });
  gigChatReadUpsert.mockResolvedValue({});
  gigChatReadFindUnique.mockResolvedValue(null);
  gigChatReadFindMany.mockResolvedValue([]);
  bandMemberFindMany.mockResolvedValue([]);
  bandMemberFindFirst.mockResolvedValue(null);
  gigBandMemberFindMany.mockResolvedValue([]);
  gigBandMemberFindFirst.mockResolvedValue(null);
});

describe("GET /api/gigs/[id]/chat", () => {
  it("returns 401 when the auth guard rejects the caller", async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/gig-1/chat"), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the gig does not exist", async () => {
    gigFindUnique.mockResolvedValue(null);
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/nope/chat"), params("nope"));
    expect(res.status).toBe(404);
    expect(gigMessageFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a caller who neither owns the gig nor is rostered on it", async () => {
    gigFindUnique.mockResolvedValue({
      id: "gig-1",
      userId: OWNER.id,
      eventName: "Festival",
    });
    gigBandMemberFindMany.mockResolvedValue([]); // nothing shared with BANDMATE
    requireAuthMock.mockResolvedValue({ user: BANDMATE });
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/gig-1/chat"), params());
    expect(res.status).toBe(403);
    expect(gigMessageFindMany).not.toHaveBeenCalled();
  });

  it("lets a rostered bandmate read the chat", async () => {
    gigFindUnique.mockResolvedValue({
      id: "gig-1",
      userId: OWNER.id,
      eventName: "Festival",
    });
    // BANDMATE owns a BandMember row attached to this gig.
    gigBandMemberFindMany.mockResolvedValue([{ gigId: "gig-1" }]);
    requireAuthMock.mockResolvedValue({ user: BANDMATE });
    gigChatReadFindUnique.mockResolvedValue({
      lastReadAt: new Date("2026-01-01T00:00:00Z"),
    });
    gigMessageFindMany.mockResolvedValue([]);
    gigMessageCount.mockResolvedValue(0);
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/gig-1/chat"), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.gigId).toBe("gig-1");
    expect(json.messages).toEqual([]);
  });

  it("returns messages oldest-first with unread count and self flags", async () => {
    gigFindUnique.mockResolvedValue({
      id: "gig-1",
      userId: OWNER.id,
      eventName: "Festival",
    });
    bandMemberFindMany.mockResolvedValue([{ id: "member-owner" }]);
    // The query pages newest first; the route reverses for rendering.
    gigMessageFindMany.mockResolvedValue([
      {
        id: "m-2",
        content: "newer",
        createdAt: new Date("2026-02-02T10:00:00Z"),
        authorId: "member-mate",
        author: { id: "member-mate", name: "Mate" },
      },
      {
        id: "m-1",
        content: "older",
        createdAt: new Date("2026-02-01T10:00:00Z"),
        authorId: "member-owner",
        author: { id: "member-owner", name: "Owner" },
      },
    ]);
    gigMessageCount.mockResolvedValue(1);
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/gig-1/chat"), params());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.messages.map((m: any) => m.id)).toEqual(["m-1", "m-2"]);
    expect(json.messages[0].isSelf).toBe(true);
    expect(json.messages[1].isSelf).toBe(false);
    expect(json.unreadCount).toBe(1);

    // Unread excludes the caller's own messages via notIn.
    const where = gigMessageCount.mock.calls[0][0].where;
    expect(where.authorId).toEqual({ notIn: ["member-owner"] });
    expect(where.gigId).toBe("gig-1");
    expect(gigMessageFindMany.mock.calls[0][0].take).toBe(200);
    expect(gigMessageFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("marks the chat read when ?markRead=1 is passed", async () => {
    gigFindUnique.mockResolvedValue({
      id: "gig-1",
      userId: OWNER.id,
      eventName: "Festival",
    });
    gigMessageFindMany.mockResolvedValue([]);
    gigMessageCount.mockResolvedValue(0);
    const { GET } = await import("@/app/api/gigs/[id]/chat/route");

    const res = await GET(
      authedRequest("http://localhost/api/gigs/gig-1/chat?markRead=1"),
      params()
    );
    expect(res.status).toBe(200);
    expect(gigChatReadUpsert).toHaveBeenCalledTimes(1);
    expect(gigChatReadUpsert.mock.calls[0][0].where).toEqual({
      gigId_userId: { gigId: "gig-1", userId: OWNER.id },
    });
  });
});

describe("POST /api/gigs/[id]/chat", () => {
  beforeEach(() => {
    gigFindUnique.mockResolvedValue({
      id: "gig-1",
      userId: OWNER.id,
      eventName: "Festival",
    });
  });

  async function post(body: unknown, id = "gig-1") {
    const { POST } = await import("@/app/api/gigs/[id]/chat/route");
    return POST(
      authedRequest(`http://localhost/api/gigs/${id}/chat`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      params(id)
    );
  }

  it("rejects an empty message", async () => {
    const res = await post({ content: "   " });
    expect(res.status).toBe(400);
    expect(gigMessageCreate).not.toHaveBeenCalled();
  });

  it("rejects messages over the 4000 character cap", async () => {
    const res = await post({ content: "x".repeat(4001) });
    expect(res.status).toBe(400);
    expect(gigMessageCreate).not.toHaveBeenCalled();
  });

  it("returns 404 through the same access rule as GET", async () => {
    gigFindUnique.mockResolvedValue(null);
    const res = await post({ content: "hello" }, "missing");
    expect(res.status).toBe(404);
    expect(gigMessageCreate).not.toHaveBeenCalled();
  });

  it("posts as the member rostered on the gig and marks the chat read", async () => {
    gigBandMemberFindFirst.mockResolvedValue({
      bandMember: { id: "member-owner", name: "Owner" },
    });
    gigMessageCreate.mockImplementation(async ({ data }: any) => ({
      id: "m-new",
      content: data.content,
      createdAt: new Date(),
      authorId: data.authorId,
      author: { id: "member-owner", name: "Owner" },
    }));

    const res = await post({ content: "Arrival 18:00, 2x DI" });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message.id).toBe("m-new");
    expect(json.message.author.name).toBe("Owner");
    expect(gigMessageCreate.mock.calls[0][0].data).toEqual({
      gigId: "gig-1",
      authorId: "member-owner",
      content: "Arrival 18:00, 2x DI",
    });
    // Sending your own message counts as reading the thread.
    expect(gigChatReadUpsert).toHaveBeenCalledTimes(1);
  });

  it("falls back to the account's own member row when none is rostered", async () => {
    gigBandMemberFindFirst.mockResolvedValue(null);
    bandMemberFindFirst.mockResolvedValue({ id: "member-owned", name: "Owner" });
    gigMessageCreate.mockImplementation(async ({ data }: any) => ({
      id: "m-new",
      content: data.content,
      createdAt: new Date(),
      authorId: data.authorId,
      author: { id: "member-owned", name: "Owner" },
    }));

    const res = await post({ content: "Carpool?" });

    expect(res.status).toBe(201);
    expect(bandMemberCreate).not.toHaveBeenCalled();
    expect(gigMessageCreate.mock.calls[0][0].data.authorId).toBe("member-owned");
  });

  it("creates a personal member row for an owner without any member row", async () => {
    gigBandMemberFindFirst.mockResolvedValue(null);
    bandMemberFindFirst.mockResolvedValue(null);
    bandMemberCreate.mockResolvedValue({ id: "member-created", name: "Owner" });
    gigMessageCreate.mockImplementation(async ({ data }: any) => ({
      id: "m-new",
      content: data.content,
      createdAt: new Date(),
      authorId: data.authorId,
      author: { id: "member-created", name: "Owner" },
    }));

    const res = await post({ content: "Carpool?" });

    expect(res.status).toBe(201);
    expect(bandMemberCreate).toHaveBeenCalledTimes(1);
    expect(bandMemberCreate.mock.calls[0][0].data).toMatchObject({
      userId: OWNER.id,
      name: "Owner",
    });
  });
});

describe("GET /api/gigs/chat-unread", () => {
  it("returns 401 without auth", async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { GET } = await import("@/app/api/gigs/chat-unread/route");

    const res = await GET(authedRequest("http://localhost/api/gigs/chat-unread?ids=gig-1"));
    expect(res.status).toBe(401);
  });

  it("counts only accessible gigs and skips the caller's own messages", async () => {
    gigFindMany.mockResolvedValue([
      { id: "gig-mine", userId: OWNER.id },
      { id: "gig-foreign", userId: "someone-else" },
    ]);
    gigBandMemberFindMany.mockResolvedValue([{ gigId: "gig-mine" }]); // shared gig
    bandMemberFindMany.mockResolvedValue([{ id: "member-owner" }]);
    gigChatReadFindMany.mockResolvedValue([
      { gigId: "gig-mine", lastReadAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    gigMessageFindMany.mockResolvedValue([
      { gigId: "gig-mine", createdAt: new Date("2026-01-02T00:00:00Z") }, // unread
      { gigId: "gig-mine", createdAt: new Date("2025-12-31T00:00:00Z") }, // read
      { gigId: "gig-mine", createdAt: new Date("2026-01-03T00:00:00Z") }, // own (already filtered server-side)
    ]);

    const { GET } = await import("@/app/api/gigs/chat-unread/route");
    const res = await GET(
      authedRequest(
        "http://localhost/api/gigs/chat-unread?ids=gig-mine,gig-foreign,gig-missing"
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    // gig-foreign and gig-missing are not accessible → absent from the map.
    expect(Object.keys(json.counts)).toEqual(["gig-mine"]);
    expect(json.counts["gig-mine"]).toBe(2);

    // Only accessible gigs are queried, own messages excluded.
    expect(gigMessageFindMany.mock.calls[0][0].where.gigId).toEqual({
      in: ["gig-mine"],
    });
    expect(gigMessageFindMany.mock.calls[0][0].where.authorId).toEqual({
      notIn: ["member-owner"],
    });
  });

  it("returns an empty map for an empty id list", async () => {
    const { GET } = await import("@/app/api/gigs/chat-unread/route");
    const res = await GET(authedRequest("http://localhost/api/gigs/chat-unread"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ counts: {} });
    expect(gigFindMany).not.toHaveBeenCalled();
  });
});



