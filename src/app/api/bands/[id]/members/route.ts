import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isBandLeaderOrOwner } from "@/lib/band-sharing";
import { invalidateCache } from "@/lib/cache";

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
      select: { id: true, email: true },
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
        isCurrentUser: Boolean(
          (userId && userId === viewer.id) ||
          (viewer.email && member.email && member.email.toLowerCase() === viewer.email.toLowerCase())
        ),
        isOwner: Boolean(userId && userId === band.userId),
      }))
    );
  } catch (error) {
    console.error(`GET /api/bands/${params.id}/members error:`, error);
    return NextResponse.json({ error: "Failed to load band members" }, { status: 500 });
  }
}

/**
 * DELETE /api/bands/[id]/members?memberId=...
 *
 * Removes a member from the band.
 * Allowed for:
 * - Band leaders and owners (kicking someone from the band).
 * - The member themselves (leaving the band).
 * Disallows kicking the band owner.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseId = await getVerifiedUserIdFromHeader(request);
    if (!supabaseId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const viewer = await prisma.user.findUnique({
      where: { supabaseId },
      select: { id: true, email: true },
    });
    if (!viewer) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const band = await prisma.bands.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true },
    });
    if (!band) return NextResponse.json({ error: "Band not found" }, { status: 404 });

    const url = new URL(request.url);
    let memberId = url.searchParams.get("memberId");
    if (!memberId) {
      const body = await request.json().catch(() => ({}));
      memberId = body?.memberId;
    }

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const targetMember = await prisma.bandMember.findUnique({
      where: { id: memberId },
      select: { id: true, name: true, email: true, userId: true, bands: true },
    });

    if (!targetMember || !targetMember.bands.includes(band.name)) {
      return NextResponse.json(
        { error: "Member not found in this band" },
        { status: 404 }
      );
    }

    const isSelf = Boolean(
      (targetMember.userId && targetMember.userId === viewer.id) ||
      (viewer.email && targetMember.email && targetMember.email.toLowerCase() === viewer.email.toLowerCase())
    );

    if (!isSelf) {
      const isLeader = await isBandLeaderOrOwner(band.id, viewer.id);
      if (!isLeader) {
        return NextResponse.json(
          { error: "Forbidden: Only band leaders or owners can remove members" },
          { status: 403 }
        );
      }

      // Disallow kicking the band owner
      if (targetMember.userId && targetMember.userId === band.userId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot remove the band owner from the band" },
          { status: 403 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const nextBands = targetMember.bands.filter((b) => b !== band.name);
      await tx.bandMember.update({
        where: { id: targetMember.id },
        data: {
          bands: nextBands,
          ...(nextBands.length === 0 ? { isLeader: false } : {}),
        },
      });

      const bandGigs = await tx.gig.findMany({
        where: {
          OR: [
            { bandId: band.id },
            { performers: { equals: band.name, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const gigIds = bandGigs.map((g) => g.id);
      if (gigIds.length > 0) {
        await tx.gigBandMember.deleteMany({
          where: {
            bandMemberId: targetMember.id,
            gigId: { in: gigIds },
          },
        });
      }
    });

    invalidateCache(`${viewer.id}:band-members`);
    invalidateCache(`${viewer.id}:gigs`);
    if (targetMember.userId) {
      invalidateCache(`${targetMember.userId}:band-members`);
      invalidateCache(`${targetMember.userId}:gigs`);
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${targetMember.name} from ${band.name}`,
    });
  } catch (error) {
    console.error(`DELETE /api/bands/${params.id}/members error:`, error);
    return NextResponse.json(
      { error: "Failed to remove member from band" },
      { status: 500 }
    );
  }
}
