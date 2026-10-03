import { createHash, randomBytes } from "crypto";

/**
 * iCalendar (RFC 5545) feed generation.
 *
 * Calendar apps poll this URL on their own schedule with no auth header, which
 * is the whole point of a subscription feed and also why the token is treated
 * as a credential: it is hashed at rest and regenerable.
 *
 * Everything here is pure string building so it can be unit tested without a
 * database or an HTTP layer.
 */

const CRLF = "\r\n";
/** Default gig length when the gig has no explicit end time. */
const DEFAULT_DURATION_MINUTES = 180;

/** Escapes text for an iCalendar TEXT value (RFC 5545 §3.3.11). */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, continuation lines start with a space.
 * Long notes and URLs routinely exceed the limit and some parsers reject them.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    // Continuation lines carry a leading space, so they hold 74 octets.
    const limit = out.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);

  return out.join(CRLF + " ");
}

/** Formats a Date as an iCalendar UTC timestamp (20260101T120000Z). */
export function formatIcalDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** A stable, opaque UID for a gig occurrence. */
export function gigUid(gigId: string): string {
  return `${gigId}@gigsmanager`;
}

/** Generates a fresh feed token. 32 bytes of entropy, URL-safe base64url. */
export function generateCalendarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hashes a token for storage and lookup. */
export function hashCalendarToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IcalGig {
  id: string;
  eventName: string;
  date: Date;
  /** Optional end time; the gig duration is used when absent. */
  endDate?: Date | null;
  venueName?: string | null;
  venueLocation?: string | null;
  performers?: string | null;
  notes?: string | null;
  isTentative?: boolean;
  /** The viewer's own attendance answer, when the gig is shared with them. */
  rsvpStatus?: string | null;
}

/** Human-readable attendance label embedded in the event description. */
export function rsvpLabel(status?: string | null): string | null {
  switch (status) {
    case "ATTENDING":
      return "Attending";
    case "DECLINED":
      return "Declined";
    case "MAYBE":
      return "Maybe";
    case "PENDING":
      return "Awaiting reply";
    default:
      return null;
  }
}

/**
 * Builds the DESCRIPTION body: notes, band and the viewer's RSVP answer.
 *
 * Order is fixed so the output is diffable between polls — calendar clients
 * refetch constantly and an unstable body makes them redraw for no reason.
 */
export function buildDescription(gig: IcalGig): string {
  const parts: string[] = [];

  if (gig.notes?.trim()) parts.push(gig.notes.trim());

  const band = gig.performers?.trim();
  if (band) parts.push(`Band: ${band}`);

  const attendance = rsvpLabel(gig.rsvpStatus);
  if (attendance) parts.push(`My attendance: ${attendance}`);

  if (gig.isTentative) parts.push("Tentative booking");

  return parts.join("\n");
}

export interface IcalOptions {
  calendarName: string;
  /** Injectable so tests get deterministic output. */
  now?: Date;
  /** Stable value for DTSTAMP; omit to fall back to `now`. */
  stamp?: Date;
}

/**
 * Renders gigs as a VCALENDAR body.
 *
 * UIDs are scoped by gig id, which is what stops a regenerated token (or a
 * second calendar) from clobbering unrelated events in the same client.
 */
export function buildIcalFeed(gigs: IcalGig[], options: IcalOptions): string {
  const now = options.now ?? new Date();
  const stamp = options.stamp ?? now;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID identifies the producer; the -// form is the conventional shape.
    `PRODID:-//GigsManager//iCal feed ${options.calendarName}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(options.calendarName)}`,
    "X-WR-TIMEZONE:UTC",
  ];

  for (const gig of gigs) {
    const start = new Date(gig.date);
    if (Number.isNaN(start.getTime())) continue;

    const end = gig.endDate ? new Date(gig.endDate) : null;
    const endValid = end && !Number.isNaN(end.getTime()) && end.getTime() > start.getTime();
    const dtEnd = endValid
      ? end!
      : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

    const location = [gig.venueName, gig.venueLocation].filter(Boolean).join(", ");
    const description = buildDescription(gig);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${foldLine(gigUid(gig.id))}`,
      // DTSTAMP is when this record was produced; clients require it present.
      `DTSTAMP:${formatIcalDate(stamp)}`,
      `DTSTART:${formatIcalDate(start)}`,
      `DTEND:${formatIcalDate(dtEnd)}`,
      `SUMMARY:${escapeIcalText(gig.eventName || "Untitled gig")}`
    );

    if (location) lines.push(`LOCATION:${escapeIcalText(location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcalText(description)}`);

    // Tentative bookings are how the app already flags unconfirmed dates.
    lines.push(`STATUS:${gig.isTentative ? "TENTATIVE" : "CONFIRMED"}`);
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** The Content-Type every major calendar client expects for a feed. */
export const ICAL_CONTENT_TYPE = "text/calendar; charset=utf-8";
