import { beforeEach, describe, expect, it, vi } from "vitest";

const { gigFindUnique, bandMemberFindMany, linkFindFirst, linkFindMany, linkUpdate } =
  vi.hoisted(() => ({
    gigFindUnique: vi.fn(),
    bandMemberFindMany: vi.fn(),
    linkFindFirst: vi.fn(),
    linkFindMany: vi.fn(),
    linkUpdate: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gig: { findUnique: gigFindUnique },
    bandMember: { findMany: bandMemberFindMany },
    gigBandMember: {
      findFirst: linkFindFirst,
      findMany: linkFindMany,
      update: linkUpdate,
    },
  },
}));

vi.mock("@/lib/api-auth-helpers", () => ({
  getBearerToken: (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
  },
  validateTokenAndGetUser: async (token: string) =>
    token === "good"
      ? { user: { id: "user-1" } }
      : { error: "Unauthorized", status: 401 },
}));

import { GET, POST } from "@/app/api/gigs/[id]/rsvp/route";

const AUTHORIZED = { Authorization: "Bearer good" };

function post(body: unknown) {
  return new Request("https://example.com/api/gigs/gig-1/rsvp", {
    method: "POST",
    headers: { ...AUTHORIZED, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

function get() {
  return new Request("https://example.com/api/gigs/gig-1/rsvp", {
    headers: AUTHORIZED,
  }) as any;
}

const params = { params: { id: "gig-1" } } as any;

function link(overrides: Record<string, any> = {}) {
  return {
    id: "link-1",
    rsvpStatus: "PENDING",
    bandMemberId: "member-1",
    bandMember: { id: "member-1", name: "Ada", avatarUrl: null },
    ...overrides,
  };
}

function secondMember(overrides: Record<string, any> = {}) {
  return {
    id: "link-2",
    rsvpStatus: "PENDING",
    bandMemberId: "member-2",
    bandMember: { id: "member-2", name: "Bo", avatarUrl: null },
    ...overrides,
  };
}

/**
 * A bandmate answering for a gig must hold a GigBandMember row on that gig.
 * These pin the two ways to get that wrong: accepting any status string, and
 * writing somebody else's row.
 */
describe("POST /api/gigs/[id]/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bandMemberFindMany.mockResolvedValue([{ id: "member-1" }]);
    linkFindFirst.mockResolvedValue({ id: "link-1" });
    linkFindMany.mockResolvedValue([link()]);
    linkUpdate.mockResolvedValue(link({ rsvpStatus: "ATTENDING" }));
  });

  it("rejects a missing bearer token", async () => {
    const res = await POST(
      new Request("https://example.com/api/gigs/gig-1/rsvp", { method: "POST" }) as any,
      params
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown status", async () => {
    const res = await POST(post({ status: "ALMOST_THERE" }), params);
    expect(res.status).toBe(400);
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing status", async () => {
    const res = await POST(post({}), params);
    expect(res.status).toBe(400);
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it("writes only the caller's own linked row", async () => {
    const res = await POST(post({ status: "ATTENDING" }), params);

    expect(res.status).toBe(200);
    expect(linkFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gigId: "gig-1", bandMemberId: { in: ["member-1"] } },
      })
    );
    expect(linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "link-1" },
        data: { rsvpStatus: "ATTENDING" },
      })
    );
  });

  it("returns the refreshed summary so the badge needs no second request", async () => {
    linkFindMany.mockResolvedValue([
      link({ rsvpStatus: "ATTENDING" }),
      secondMember({ rsvpStatus: "DECLINED" }),
    ]);

    const res = await POST(post({ status: "ATTENDING" }), params);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      summary: { total: 2, attending: 1, declined: 1, maybe: 0, pending: 0 },
      rsvp: { status: "ATTENDING", memberId: "member-1", memberName: "Ada" },
    });
  });

  it("refuses when the caller is not linked to the gig", async () => {
    linkFindFirst.mockResolvedValue(null);
    const res = await POST(post({ status: "ATTENDING" }), params);
    expect(res.status).toBe(403);
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it("refuses when the caller is not a band member at all", async () => {
    bandMemberFindMany.mockResolvedValue([]);
    const res = await POST(post({ status: "ATTENDING" }), params);
    expect(res.status).toBe(403);
    expect(linkUpdate).not.toHaveBeenCalled();
  });
});

/** The owner may always read who is coming, even without a row of their own. */
describe("GET /api/gigs/[id]/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bandMemberFindMany.mockResolvedValue([]);
    linkFindMany.mockResolvedValue([
      link({ rsvpStatus: "MAYBE" }),
      secondMember(),
    ]);
  });

  it("marks the caller's own row with myMemberId", async () => {
    gigFindUnique.mockResolvedValue({ userId: "someone-else" });
    bandMemberFindMany.mockResolvedValue([{ id: "member-2" }]);

    const res = await GET(get(), params);

    await expect(res.json()).resolves.toMatchObject({
      myMemberId: "member-2",
      summary: { total: 2, attending: 0, declined: 0, maybe: 1, pending: 1 },
    });
  });

  it("lets the owner read the roster with a null myMemberId", async () => {
    gigFindUnique.mockResolvedValue({ userId: "user-1" });

    const res = await GET(get(), params);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ myMemberId: null });
  });

  it("hides the roster from an unrelated user", async () => {
    gigFindUnique.mockResolvedValue({ userId: "someone-else" });

    const res = await GET(get(), params);

    expect(res.status).toBe(403);
  });

  it("404s an unknown gig", async () => {
    gigFindUnique.mockResolvedValue(null);

    const res = await GET(get(), params);

    expect(res.status).toBe(404);
  });
});
