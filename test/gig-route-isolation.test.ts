import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authGetUser,
  getOrCreateUser,
  gigFindUnique,
  gigFindMany,
  gigUpdate,
  gigDelete,
  gigBandMemberFindMany,
  bandMemberFindMany,
  bandsFindUnique,
  bandsFindMany,
} = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  getOrCreateUser: vi.fn(),
  gigFindUnique: vi.fn(),
  gigFindMany: vi.fn(),
  gigUpdate: vi.fn(),
  gigDelete: vi.fn(),
  gigBandMemberFindMany: vi.fn(),
  bandMemberFindMany: vi.fn(),
  bandsFindUnique: vi.fn(),
  bandsFindMany: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { auth: { getUser: authGetUser } } }));
vi.mock("@/lib/auth-helpers", () => ({ getOrCreateUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gig: { findUnique: gigFindUnique, findMany: gigFindMany, update: gigUpdate, delete: gigDelete },
    gigBandMember: { findMany: gigBandMemberFindMany },
    bandMember: { findMany: bandMemberFindMany },
    bands: { findUnique: bandsFindUnique, findMany: bandsFindMany },
  },
}));
vi.mock("@/lib/notification-service", () => ({ notifyPaymentReceived: vi.fn() }));
vi.mock("@/lib/webhook-service", () => ({ webhookPaymentReceived: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn() }));

import { DELETE, GET, PUT } from "@/app/api/gigs/[id]/route";

const params = { params: { id: "gig-1" } };
const request = (method: string, body?: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/gigs/gig-1", {
    method,
    headers: { Authorization: "Bearer verified", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  authGetUser.mockResolvedValue({ data: { user: { id: "supabase-b" } }, error: null });
  getOrCreateUser.mockResolvedValue({ id: "user-b" });
  gigFindUnique.mockResolvedValue({
    id: "gig-1",
    userId: "user-a",
    eventName: "Private gig",
    date: new Date("2030-01-01"),
    performers: "Band A",
    bandId: "band-a",
    setlistId: null,
  });
  // Default: the viewer is not linked to any band, so nothing is shared.
  gigBandMemberFindMany.mockResolvedValue([]);
  bandMemberFindMany.mockResolvedValue([]);
  gigFindMany.mockResolvedValue([]);
  bandsFindUnique.mockResolvedValue(null);
  bandsFindMany.mockResolvedValue([]);
});

describe("gig route tenant isolation", () => {
  it("forbids direct reads of another user's gig", async () => {
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(403);
  });

  it("allows a bandmate to read a gig shared with them, redacted", async () => {
    // The viewer is linked to gig-1 through their own band member row, which is
    // exactly the rule GET /api/gigs uses to decide what is shared.
    gigBandMemberFindMany.mockResolvedValue([{ gigId: "gig-1" }]);
    bandMemberFindMany.mockResolvedValue([{ bands: ["Band A"], isLeader: false }]);
    bandsFindUnique.mockResolvedValue({ name: "Band A" });

    const response = await GET(request("GET"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sharedWithMe).toBe(true);
    expect(body.canEdit).toBe(false);
  });

  it("forbids updates and deletes of another user's gig", async () => {
    const updateResponse = await PUT(request("PUT", {
      eventName: "Changed",
      date: "2030-01-01",
      performers: "Band A",
      numberOfMusicians: 2,
      performanceFee: 100,
      technicalFee: 0,
      bandId: "band-a",
    }), params);
    const deleteResponse = await DELETE(request("DELETE"), params);

    expect(updateResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(gigUpdate).not.toHaveBeenCalled();
    expect(gigDelete).not.toHaveBeenCalled();
  });
});
