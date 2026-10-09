import { describe, expect, it, vi } from "vitest";
import { getBandAccess } from "@/lib/band-access";

function prismaFor(overrides: Record<string, unknown> = {}) {
  return {
    bands: { findUnique: vi.fn().mockResolvedValue({ id: "band-1", name: "The Notes", userId: "owner-1" }) },
    bandMember: { findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

describe("getBandAccess", () => {
  it("allows the band owner", async () => {
    const prisma = prismaFor();
    await expect(getBandAccess(prisma, "band-1", "owner-1")).resolves.toEqual({
      band: { id: "band-1", name: "The Notes", userId: "owner-1" },
      isOwner: true,
    });
    expect(prisma.bandMember.findFirst).not.toHaveBeenCalled();
  });

  it("allows a member only when their roster contains the requested band", async () => {
    const prisma = prismaFor({
      bandMember: { findFirst: vi.fn().mockResolvedValue({ id: "member-1" }) },
    });
    await expect(getBandAccess(prisma, "band-1", "member-1")).resolves.toMatchObject({
      isOwner: false,
    });
    expect(prisma.bandMember.findFirst).toHaveBeenCalledWith({
      where: { userId: "member-1", bands: { has: "The Notes" } },
      select: { id: true },
    });
  });

  it("denies an unrelated account and unknown band", async () => {
    const unrelated = prismaFor();
    await expect(getBandAccess(unrelated, "band-1", "other-user")).resolves.toBeNull();

    const missing = prismaFor({ bands: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(getBandAccess(missing, "missing", "other-user")).resolves.toBeNull();
  });
});
