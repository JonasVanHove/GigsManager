import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * POST /api/bands/[id]/leave (and DELETE)
 *
 * Allows a user (whether regular member, appointed leader, or owner) to leave a band.
 * When leaving:
 * - The band is removed from the user's BandMember records.
 * - The user's GigBandMember links for the band's gigs are removed.
 * - If the owner leaves and other members exist, ownership is transferred.
 * - If the owner leaves and no registered members remain, the band is deleted.
 */
async function handleLeave(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseId = await getVerifiedUserIdFromHeader(request);
    if (!supabaseId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const viewer = await prisma.user.findUnique({
      where: { supabaseId },
      select: { id: true, email: true },
    });
    if (!viewer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const band = await prisma.bands.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true },
    });
    if (!band) {
      return NextResponse.json({ error: "Band not found" }, { status: 404 });
    }

    const isOwner = band.userId === viewer.id;
    const userMembers = await prisma.bandMember.findMany({
      where: {
        OR: [
          { userId: viewer.id },
          ...(viewer.email
            ? [{ email: { equals: viewer.email, mode: "insensitive" as const } }]
            : []),
        ],
        bands: { has: band.name },
      },
    });

    if (!isOwner && userMembers.length === 0) {
      return NextResponse.json(
        { error: "You are not a member of this band" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Find all gigs of this band
      const bandGigs = await tx.gig.findMany({
        where: {
          OR: [
            { bandId: band.id },
            { performers: { equals: band.name, mode: "insensitive" as const } },
          ],
        },
        select: { id: true },
      });
      const gigIds = bandGigs.map((g) => g.id);

      // Unlink viewer's member records from this band
      for (const member of userMembers) {
        const nextBands = member.bands.filter((b) => b !== band.name);
        await tx.bandMember.update({
          where: { id: member.id },
          data: {
            bands: nextBands,
            ...(nextBands.length === 0 ? { isLeader: false } : {}),
          },
        });

        if (gigIds.length > 0) {
          await tx.gigBandMember.deleteMany({
            where: {
              bandMemberId: member.id,
              gigId: { in: gigIds },
            },
          });
        }
      }

      // If the band owner leaves, transfer ownership or delete the band
      if (isOwner) {
        const remainingMembers = await tx.bandMember.findMany({
          where: {
            bands: { has: band.name },
            NOT: {
              OR: [
                { userId: viewer.id },
                ...(viewer.email
                  ? [{ email: { equals: viewer.email, mode: "insensitive" as const } }]
                  : []),
              ],
            },
          },
          orderBy: [{ isLeader: "desc" }, { createdAt: "asc" }],
        });

        const nextOwner = remainingMembers.find((m) => Boolean(m.userId));
        if (nextOwner && nextOwner.userId) {
          await tx.bands.update({
            where: { id: band.id },
            data: { userId: nextOwner.userId },
          });
          if (!nextOwner.isLeader) {
            await tx.bandMember.update({
              where: { id: nextOwner.id },
              data: { isLeader: true },
            });
          }
        } else {
          // No active member account remaining -> delete the band
          await tx.$executeRaw`DELETE FROM bands WHERE id = ${band.id}`;
        }
      }
    });

    invalidateCache(`${viewer.id}:band-members`);
    invalidateCache(`${viewer.id}:gigs`);

    return NextResponse.json({ success: true, message: "Left band successfully" });
  } catch (error) {
    console.error(`POST /api/bands/${params.id}/leave error:`, error);
    return NextResponse.json(
      { error: "Failed to leave band" },
      { status: 500 }
    );
  }
}

export { handleLeave as POST, handleLeave as DELETE };
