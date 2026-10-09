import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { findBandByInviteCode } from "@/lib/band-invites";

export const runtime = "nodejs";

/**
 * POST /api/bands/join  { code }
 *
 * Accepts a band invitation for the signed-in user. Idempotent: accepting twice
 * is a no-op rather than a duplicate member row.
 *
 * The member row is keyed on the user's *own* account, so the gigs shared
 * through GigBandMember become visible on their dashboard immediately — there is
 * no separate "join" record to reconcile later.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getVerifiedUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const code = String(body.code || "");
    if (!code.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const band = await findBandByInviteCode(code);
    if (!band) {
      return NextResponse.json({ error: "Unknown invite code" }, { status: 404 });
    }

    const { bandGigs, member } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { supabaseId: userId },
        select: { id: true, email: true, name: true },
      });
      if (!user) throw new Error("JOIN_USER_NOT_FOUND");
      const memberName = user.name || user.email.split("@")[0] || "Band member";

      // A bandmate's identity is their own account, so reuse the member row
      // this user already has rather than creating a second one.
      let member = await tx.bandMember.findFirst({
        where: { userId: user.id, bands: { has: band.name } },
        orderBy: { createdAt: "asc" },
        select: { id: true, bands: true },
      });

      if (!member) {
        const invitedMember = await tx.bandMember.findFirst({
          where: { userId: null, email: user.email, bands: { has: band.name } },
          orderBy: { createdAt: "asc" },
          select: { id: true, bands: true },
        });
        if (invitedMember) {
          member = await tx.bandMember.update({
            where: { id: invitedMember.id },
            data: { userId: user.id },
            select: { id: true, bands: true },
          });
        }
      }

      if (!member) {
        // The schema enforces one row per account/name. Reuse that same
        // identity when a repeated local/test run already linked the account
        // to another band, rather than creating a duplicate member row.
        member = await tx.bandMember.findFirst({
          where: { userId: user.id, name: memberName },
          orderBy: { createdAt: "asc" },
          select: { id: true, bands: true },
        });
      }

      if (!member) {
        member = await tx.bandMember.create({
          data: {
            name: memberName,
            email: user.email,
            userId: user.id,
            bands: [band.name],
          },
          select: { id: true, bands: true },
        });
      } else if (!member.bands.includes(band.name)) {
        member = await tx.bandMember.update({
          where: { id: member.id },
          data: { bands: [...member.bands, band.name] },
          select: { id: true, bands: true },
        });
      }

      const bandGigs = await tx.gig.findMany({
        where: {
          OR: [{ bandId: band.id }, { performers: { equals: band.name, mode: "insensitive" } }],
        },
        select: { id: true },
      });

      for (const gig of bandGigs) {
        await tx.gigBandMember.upsert({
          where: { gigId_bandMemberId: { gigId: gig.id, bandMemberId: member.id } },
          create: { gigId: gig.id, bandMemberId: member.id },
          update: {},
        });
      }

      return { bandGigs, member };
    });

    return NextResponse.json({
      joined: true,
      band: { id: band.id, name: band.name, color: band.color },
      gigsLinked: bandGigs.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JOIN_USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("POST /api/bands/join error:", error);
    return NextResponse.json({ error: "Failed to join band" }, { status: 500 });
  }
}