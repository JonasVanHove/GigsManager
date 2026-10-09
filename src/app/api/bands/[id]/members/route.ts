import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Return the canonical roster for one band. The legacy /api/band-members
 * endpoint is account-scoped and is still used for personal management data;
 * this endpoint is band-scoped so independent sessions resolve the same rows.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseId = await getVerifiedUserIdFromHeader(request);
    if (!supabaseId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const viewer = await prisma.user.findUnique({
      where: { supabaseId },
      select: { id: true },
    });
    if (!viewer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const band = await prisma.bands.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true },
    });
    if (!band) return NextResponse.json({ error: "Band not found" }, { status: 404 });

    const membership = await prisma.bandMember.findFirst({
      where: { userId: viewer.id, bands: { has: band.name } },
      select: { id: true },
    });
    if (band.userId !== viewer.id && !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await prisma.bandMember.findMany({
      where: { bands: { has: band.name } },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        avatarUrl: true,
        isLeader: true,
        bands: true,
        updatedAt: true,
        userId: true,
      },
    });

    return NextResponse.json(
      members.map(({ userId, ...member }) => ({
        ...member,
        claimed: Boolean(userId),
      }))
    );
  } catch (error) {
    console.error(`GET /api/bands/${params.id}/members error:`, error);
    return NextResponse.json({ error: "Failed to load band members" }, { status: 500 });
  }
}
