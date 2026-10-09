import { beforeEach, describe, expect, it, vi } from "vitest";

const { userUpsert, claimUnclaimedMembersForUser } = vi.hoisted(() => ({
  userUpsert: vi.fn(),
  claimUnclaimedMembersForUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { upsert: userUpsert } },
}));
vi.mock("@/lib/band-invites", () => ({
  claimUnclaimedMembersForUser,
}));

const { getOrCreateUser } = await import("@/lib/auth-helpers");

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userUpsert.mockResolvedValue({
      id: "user-internal",
      supabaseId: "supabase-user",
      email: "user@example.com",
      name: "User",
    });
  });

  it("uses one atomic upsert for concurrent first requests", async () => {
    await Promise.all([
      getOrCreateUser("supabase-user", "user@example.com", "User"),
      getOrCreateUser("supabase-user", "user@example.com", "User"),
    ]);

    expect(userUpsert).toHaveBeenCalledTimes(2);
    expect(userUpsert).toHaveBeenCalledWith({
      where: { supabaseId: "supabase-user" },
      update: { email: "user@example.com", name: "User" },
      create: {
        supabaseId: "supabase-user",
        email: "user@example.com",
        name: "User",
      },
    });
    expect(claimUnclaimedMembersForUser).toHaveBeenCalledTimes(2);
  });
});
