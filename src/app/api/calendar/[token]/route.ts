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
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // v1.41.0: the `attending=1` filter is gone with RSVP. Every gig shared
  // through a band membership is one the viewer is playing, so the feed is just
  // "my gigs plus my band's".
  const gigs = await loadFeedGigs(user.id, since);

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
async function loadFeedGigs(userId: string, since: Date): Promise<IcalGig[]> {
  const gigs = await prisma.gig.findMany({
    where: {
      date: { gte: since },
      OR: [
        { userId },
        {
          bandMembers: {
            some: { bandMember: { userId } },
          },
        },
      ],
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
  }));
}
