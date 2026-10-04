import { describe, expect, it } from "vitest";
import {
  buildDescription,
  buildIcalFeed,
  escapeIcalText,
  foldLine,
  formatIcalDate,
  generateCalendarToken,
  hashCalendarToken,
  type IcalGig,
} from "@/lib/ical";

/**
 * The feed is consumed by other people's calendar clients, so the contract is
 * the bytes: escaping, folding, CRLF line endings and required properties.
 * A malformed line makes Google Calendar silently drop the whole event.
 */

const NOW = new Date("2026-03-01T12:00:00.000Z");

function gig(overrides: Partial<IcalGig> = {}): IcalGig {
  return {
    id: "gig_1",
    eventName: "Jazz at the Park",
    date: new Date("2026-06-15T18:00:00.000Z"),
    ...overrides,
  };
}

function feed(gigs: IcalGig[] = [gig()]) {
  return buildIcalFeed(gigs, { calendarName: "Test", now: NOW });
}

describe("iCal text escaping", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    expect(escapeIcalText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });

  it("turns real newlines into literal \\n", () => {
    expect(escapeIcalText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeIcalText("line1\r\nline2")).toBe("line1\\nline2");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeIcalText("Blue Note Café")).toBe("Blue Note Café");
  });
});

describe("line folding", () => {
  it("leaves short lines untouched", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds long lines with a leading space on continuations", () => {
    const folded = foldLine(`DESCRIPTION:${"x".repeat(300)}`);
    const parts = folded.split("\r\n");

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    // Every emitted line must be within the 75-octet limit.
    const encoder = new TextEncoder();
    for (const part of parts) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character", () => {
    const folded = foldLine(`DESCRIPTION:${"é".repeat(200)}`);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      // A broken split would leave a replacement character behind.
      expect(part).not.toContain("\uFFFD");
    }
  });
});

describe("date formatting", () => {
  it("renders UTC basic format", () => {
    expect(formatIcalDate(new Date("2026-06-15T18:30:45.123Z"))).toBe("20260615T183045Z");
  });
});

describe("event descriptions", () => {
  it("includes notes and band in a stable order", () => {
    const body = buildDescription({
      ...gig(),
      notes: "Bring charts",
      performers: "The Notes",
    });
    expect(body).toBe("Bring charts\nBand: The Notes");
  });

  it("marks a tentative booking", () => {
    expect(buildDescription({ ...gig(), isTentative: true })).toBe("Tentative booking");
  });

  it("returns an empty body when there is nothing to say", () => {
    expect(buildDescription(gig())).toBe("");
  });
});

describe("buildIcalFeed", () => {
  it("emits a valid VCALENDAR envelope with CRLF endings", () => {
    const ics = feed();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("CALSCALE:GREGORIAN");
  });

  it("includes the properties every client requires", () => {
    const ics = feed();
    expect(ics).toContain("UID:gig_1@gigsmanager");
    expect(ics).toContain("DTSTAMP:20260301T120000Z");
    expect(ics).toContain("DTSTART:20260615T180000Z");
    // No end date on the gig, so the default three-hour block is used.
    expect(ics).toContain("DTEND:20260615T210000Z");
    expect(ics).toContain("SUMMARY:Jazz at the Park");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("marks tentative gigs as TENTATIVE", () => {
    expect(feed([gig({ isTentative: true })])).toContain("STATUS:TENTATIVE");
  });

  it("combines venue name and address into LOCATION", () => {
    const ics = feed([gig({ venueName: "Blue Note", venueLocation: "Amsterdam" })]);
    expect(ics).toContain("LOCATION:Blue Note\\, Amsterdam");
  });

  it("omits LOCATION and DESCRIPTION when there is nothing to say", () => {
    const ics = feed([gig({ performers: "", notes: "" })]);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("prefers an explicit end date and ignores a nonsensical one", () => {
    expect(
      feed([gig({ endDate: new Date("2026-06-15T23:30:00.000Z") })])
    ).toContain("DTEND:20260615T233000Z");

    // An end before the start would produce a zero/negative event.
    expect(
      feed([gig({ endDate: new Date("2026-06-15T10:00:00.000Z") })])
    ).toContain("DTEND:20260615T210000Z");
  });

  it("skips gigs with an unparseable date instead of emitting garbage", () => {
    const ics = feed([gig({ date: new Date("nonsense") }), gig()]);
    expect(ics).toContain("SUMMARY:Jazz at the Park");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("emits one event per gig with distinct UIDs", () => {
    const ics = feed([gig({ id: "a" }), gig({ id: "b" })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:a@gigsmanager");
    expect(ics).toContain("UID:b@gigsmanager");
  });

  it("produces a valid empty calendar when there is nothing to show", () => {
    const ics = feed([]);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes reserved characters in the summary", () => {
    const ics = feed([gig({ eventName: "Jazz, Rock; and Blues" })]);
    expect(ics).toContain("SUMMARY:Jazz\\, Rock\\; and Blues");
  });

  it("is byte-identical across calls with the same inputs", () => {
    // Clients poll constantly; a drifting DTSTAMP would redraw for nothing.
    expect(feed()).toBe(feed());
  });
});

describe("calendar tokens", () => {
  it("generates URL-safe tokens of sufficient length", () => {
    expect(generateCalendarToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generates a different token every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateCalendarToken()));
    expect(tokens.size).toBe(50);
  });

  it("hashes deterministically so lookups can match", () => {
    const token = generateCalendarToken();
    expect(hashCalendarToken(token)).toBe(hashCalendarToken(token));
    expect(hashCalendarToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never stores the plaintext in the hash", () => {
    const token = generateCalendarToken();
    expect(hashCalendarToken(token)).not.toContain(token);
  });

  it("gives different tokens different hashes", () => {
    expect(hashCalendarToken(generateCalendarToken())).not.toBe(
      hashCalendarToken(generateCalendarToken())
    );
  });
});
