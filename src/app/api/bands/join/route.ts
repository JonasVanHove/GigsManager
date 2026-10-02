import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromHeader } from "@/lib/auth-helpers";
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
    const userId = await getUserIdFromHeader(request);
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

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // A bandmate's identity is their own account, so reuse the member row this
    // user already has rather than creating a second one.
    let member = await prisma.bandMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, bands: true },
    });

    if (!member) {
      member = await prisma.bandMember.create({
        data: {
          name: user.name || user.email.split("@")[0] || "Band member",
          email: user.email,
          userId: user.id,
          bands: [band.name],
        },
        select: { id: true, bands: true },
      });
    } else if (!member.bands.includes(band.name)) {
      member = await prisma.bandMember.update({
        where: { id: member.id },
        data: { bands: [...member.bands, band.name] },
        select: { id: true, bands: true },
      });
    }

    // Make sure the shared gigs actually exist on this user's dashboard. Any
    // gig of this band that they are not yet on becomes a GigBandMember link.
    const bandGigs = await prisma.gig.findMany({
      where: {
        OR: [{ bandId: band.id }, { performers: { equals: band.name, mode: "insensitive" } }],
      },
      select: { id: true },
    });

    let linked = 0;
    for (const gig of bandGigs) {
      const result = await prisma.gigBandMember.upsert({
        where: { gigId_bandMemberId: { gigId: gig.id, bandMemberId: member.id } },
        create: { gigId: gig.id, bandMemberId: member.id },
        update: {},
      });
      if (result) linked++;
    }

    return NextResponse.json({
      joined: true,
      band: { id: band.id, name: band.name, color: band.color },
      gigsLinked: bandGigs.length,
    });
  } catch (error) {
    console.error("POST /api/bands/join error:", error);
    return NextResponse.json({ error: "Failed to join band" }, { status: 500 });
  }
}