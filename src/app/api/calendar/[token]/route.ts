import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildIcalFeed,
  hashCalendarToken,
  ICAL_CONTENT_TYPE,
  type IcalGig,
} from "@/lib/ical";

export const runtime = "nodejs";
/** Never cache: the token is the credential and the feed changes with edits. */
export const dynamic = "force-dynamic";

/** How far back the feed reaches. Older gigs are noise in a calendar. */
const DEFAULT_WINDOW_DAYS = 90;
/** Upper bound so a crafted token cannot ask for the whole table. */
const MAX_WINDOW_DAYS = 730;

/**
 * GET /api/calendar/[token] — a user's gigs as an iCalendar feed.
 *
 * Calendar clients subscribe to this URL and poll it with no auth header, so
 * the token in the path is the entire authorisation. It is stored hashed, which
 * is why this looks the user up by `hashCalendarToken(token)` rather than
 * comparing the raw value.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  // Reject anything that cannot be our token format before touching the DB.
  // Real tokens are 43 base64url characters; this also blocks absurd URLs.
  if (!token || token.length > 128) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { calendarToken: hashCalendarToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      calendarTokenCreatedAt: true,
    },
  });

  if (!user) {
    // Deliberately indistinguishable from a missing route: a valid-token
    // oracle would let anyone confirm which tokens are real.
    return new NextResponse("Not found", { status: 404 });
  }

  const url = _request.nextUrl;
  const windowDays = clampWindow(url.searchParams.get("days"));
  // `attending=1` narrows the feed to gigs this user RSVP'd "Attending".
  const onlyAttending = url.searchParams.get("attending") === "1";
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const gigs = await loadFeedGigs(user.id, { since, onlyAttending });

  const body = buildIcalFeed(gigs, {
    calendarName: `GigsManager - ${user.name || user.email}`,
    now,
    // A stable stamp means clients only redraw when the content really moved.
    stamp: user.calendarTokenCreatedAt ?? now,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": ICAL_CONTENT_TYPE,
      "Content-Disposition": 'inline; filename="gigs.ics"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function clampWindow(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.floor(parsed), MAX_WINDOW_DAYS);
}

/**
 * Loads the gigs a feed should contain: the user's own, plus the ones shared
 * with them through a BandMember row — the same audience the dashboard shows.
 */
async function loadFeedGigs(
  userId: string,
  options: { since: Date; onlyAttending: boolean }
): Promise<IcalGig[]> {
  const sharedLinkWhere = {
    gig: { date: { gte: options.since } },
    bandMember: { userId },
  };

  // A bandmate's own attendance answer drives the `attending=1` filter.
  const attendingLinkIds = options.onlyAttending
    ? (
        await prisma.gigBandMember.findMany({
          where: { ...sharedLinkWhere, rsvpStatus: "ATTENDING" },
          select: { gigId: true },
        })
      ).map((link) => link.gigId)
    : null;

  const gigs = await prisma.gig.findMany({
    where: {
      date: { gte: options.since },
      ...(options.onlyAttending
        ? { OR: [{ userId }, { id: { in: attendingLinkIds ?? [] } }] }
        : {
            OR: [
              { userId },
              {
                bandMembers: {
                  some: { bandMember: { userId } },
                },
              },
            ],
          }),
    },
    orderBy: { date: "asc" },
    take: 2000,
    select: {
      id: true,
      eventName: true,
      date: true,
      venueName: true,
      venueLocation: true,
      performers: true,
      notes: true,
      isTentative: true,
      bandMembers: {
        where: { bandMember: { userId } },
        select: { rsvpStatus: true },
        take: 1,
      },
    },
  });

  return gigs.map((gig) => ({
    id: gig.id,
    eventName: gig.eventName,
    date: gig.date,
    endDate: null,
    venueName: gig.venueName,
    venueLocation: gig.venueLocation,
    performers: gig.performers,
    notes: gig.notes,
    isTentative: gig.isTentative,
    rsvpStatus: gig.bandMembers[0]?.rsvpStatus ?? null,
  }));
}
