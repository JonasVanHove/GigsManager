import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, validateTokenAndGetUser } from "@/lib/api-auth-helpers";
import {
  deliverRsvpChangeNotifications,
  type DeliveryResult,
} from "@/lib/rsvp-notifications";

const VALID_STATUSES = ["ATTENDING", "DECLINED", "MAYBE", "PENDING"] as const;
type RsvpStatus = (typeof VALID_STATUSES)[number];

function isRsvpStatus(value: unknown): value is RsvpStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

/** Rolls the per-member rows up into the counters the card badge renders. */
function summarise<T extends { rsvpStatus: string }>(rsvps: T[]) {
  return {
    total: rsvps.length,
    attending: rsvps.filter((r) => r.rsvpStatus === "ATTENDING").length,
    declined: rsvps.filter((r) => r.rsvpStatus === "DECLINED").length,
    maybe: rsvps.filter((r) => r.rsvpStatus === "MAYBE").length,
    pending: rsvps.filter((r) => r.rsvpStatus === "PENDING").length,
  };
}

const RSVP_SELECT = {
  id: true,
  rsvpStatus: true,
  bandMemberId: true,
  bandMember: { select: { id: true, name: true, avatarUrl: true } },
} as const;

/**
 * POST /api/gigs/[id]/rsvp
 *
 * Lets a logged-in bandmate set their own RSVP / attendance status for a gig.
 * Body: { status: "ATTENDING" | "DECLINED" | "MAYBE" | "PENDING" }
 *
 * The caller must have a BandMember record linked to this gig through
 * GigBandMember. Only that one row is ever written — a bandmate can never
 * answer on somebody else's behalf. The refreshed summary comes back in the
 * response so the card badge can update without a second round trip.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authResult = await validateTokenAndGetUser(token);
    if ("error" in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    if ("degraded" in authResult) {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }

    const { user } = authResult;
    const { id: gigId } = params;

    const body = await request.json().catch(() => null);
    const status = body?.status;
    if (!isRsvpStatus(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Every BandMember record the caller owns — one account can be listed in
    // several bands, and each record RSVPs separately.
    const myMemberIds = await prisma.bandMember.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    if (myMemberIds.length === 0) {
      return NextResponse.json(
        { error: "You are not a band member" },
        { status: 403 }
      );
    }

    const link = await prisma.gigBandMember.findFirst({
      where: { gigId, bandMemberId: { in: myMemberIds.map((m) => m.id) } },
      select: { id: true, rsvpStatus: true },
    });

    if (!link) {
      return NextResponse.json(
        { error: "You are not assigned to this gig" },
        { status: 403 }
      );
    }

    // Reading the previous answer lets us skip the (noisy) alert when someone
    // re-saves the status they already had.
    const previousStatus = link.rsvpStatus;

    const updated = await prisma.gigBandMember.update({
      where: { id: link.id },
      data: { rsvpStatus: status },
      select: RSVP_SELECT,
    });

    const all = await prisma.gigBandMember.findMany({
      where: { gigId },
      select: RSVP_SELECT,
      orderBy: { bandMember: { name: "asc" } },
    });

    const summary = summarise(all);

    // Tell the band's leaders, but only for a real change: re-submitting the
    // same answer would otherwise spam them with a "changed to Attending"
    // alert every time the card re-renders and a click slips through.
    let notified: DeliveryResult | null = null;
    if (previousStatus !== status) {
      const gig = await prisma.gig.findUnique({
        where: { id: gigId },
        select: {
          id: true,
          eventName: true,
          date: true,
          performers: true,
          bandId: true,
        },
      });

      if (gig) {
        const band = gig.bandId
          ? await prisma.bands.findUnique({
              where: { id: gig.bandId },
              select: { name: true },
            })
          : null;

        notified = await deliverRsvpChangeNotifications({
          gigId: gig.id,
          gigName: gig.eventName,
          gigDate: gig.date,
          // Fall back to the performers string, which is how the rest of the
          // app matches a gig to a band when bandId was never set.
          bandName: band?.name ?? gig.performers ?? null,
          actorUserId: user.id,
          actorName: updated.bandMember.name,
          status,
          attendingCount: summary.attending,
          totalCount: summary.total,
        });
      }
    }

    return NextResponse.json({
      success: true,
      rsvp: {
        id: updated.id,
        status: updated.rsvpStatus,
        memberId: updated.bandMemberId,
        memberName: updated.bandMember.name,
      },
      summary,
      members: all.map((r) => ({
        id: r.id,
        memberId: r.bandMemberId,
        name: r.bandMember.name,
        avatarUrl: r.bandMember.avatarUrl,
        status: r.rsvpStatus,
      })),
      notified,
    });
  } catch (err) {
    console.error("[POST /api/gigs/[id]/rsvp]", err);
    return NextResponse.json(
      { error: "Failed to update RSVP status" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gigs/[id]/rsvp
 *
 * Returns the RSVP summary for a gig: each band member's name and status.
 * Readable by the gig owner and by any bandmate playing on it.
 *
 * `myMemberId` is the caller's own BandMember row on this gig, or null. It is
 * what lets the card highlight the right button on first paint and hide the
 * quick RSVP buttons from the owner, who has no row to write to.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authResult = await validateTokenAndGetUser(token);
    if ("error" in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    if ("degraded" in authResult) {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }

    const { user } = authResult;
    const { id: gigId } = params;

    const gig = await prisma.gig.findUnique({
      where: { id: gigId },
      select: { userId: true },
    });

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    const myMemberIds = await prisma.bandMember.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const myIdSet = new Set(myMemberIds.map((m) => m.id));

    // The owner may not play on the gig (and then has no row at all), but is
    // always allowed to see who is coming. Everyone else has to be on it.
    const isOwner = gig.userId === user.id;

    const rsvps = await prisma.gigBandMember.findMany({
      where: { gigId },
      select: RSVP_SELECT,
      orderBy: { bandMember: { name: "asc" } },
    });

    if (!isOwner && !rsvps.some((r) => myIdSet.has(r.bandMemberId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const own = rsvps.find((r) => myIdSet.has(r.bandMemberId));

    return NextResponse.json({
      summary: summarise(rsvps),
      myMemberId: own?.bandMemberId ?? null,
      members: rsvps.map((r) => ({
        id: r.id,
        memberId: r.bandMemberId,
        name: r.bandMember.name,
        avatarUrl: r.bandMember.avatarUrl,
        status: r.rsvpStatus,
      })),
    });
  } catch (err) {
    console.error("[GET /api/gigs/[id]/rsvp]", err);
    return NextResponse.json(
      { error: "Failed to load RSVP data" },
      { status: 500 }
    );
  }
}
