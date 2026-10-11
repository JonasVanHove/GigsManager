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
      select: { id: true, email: true, name: true },
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

    const roster = members.map(({ userId, ...member }) => {
      const isOwner = Boolean(userId && userId === band.userId);
      return {
        ...member,
        // Leadership comes from the member's own isLeader flag only. It must NOT
        // be derived from `userId === band.userId`: in this data model a band's
        // members routinely all share the owner's userId, so an
        // `isOwner || isLeader` expression crowned every single member. Ownership
        // is reported separately as `isOwner` for the "you own this band" affordance.
        isLeader: Boolean(member.isLeader),
        claimed: Boolean(userId),
        isCurrentUser: Boolean(
          (userId && userId === viewer.id) ||
          (viewer.email && member.email && member.email.toLowerCase() === viewer.email.toLowerCase())
        ),
        isOwner,
      };
    });

    // The signed-in owner must always see themselves in their own band, even when
    // they never created a BandMember row for it (a real data state: e.g. a band
    // seeded or joined where the owner has no member entry). Without this the
    // owner was missing from their own roster. This is a server-side projection
    // of the viewer, not a persisted row, so it never duplicates a real member.
    const viewerInRoster = roster.some((m) => m.isCurrentUser);
    if (!viewerInRoster && band.userId === viewer.id) {
      roster.push({
        id: `owner-${viewer.id}`,
        name: viewer.name || viewer.email?.split("@")[0] || "You",
        email: viewer.email ?? null,
        phone: null,
        notes: null,
        // The User table has no avatar column; the client supplies the owner's
        // profile image from the Supabase session as the avatar fallback.
        avatarUrl: null,
        isLeader: false,
        bands: [band.name],
        updatedAt: new Date(),
        claimed: true,
        isCurrentUser: true,
        isOwner: true,
      });
    }

    // Leaders first, then alphabetical — matching the original ordering contract.
    roster.sort((a, b) => {
      if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(roster);
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
