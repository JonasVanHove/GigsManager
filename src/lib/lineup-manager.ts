/**
 * Band Lineup & Availability Management over time.
 * 
 * Supports:
 * - "active": fully active member
 * - "temporary_absence": temporarily away (e.g. from date to date)
 * - "departed": permanently left or stopped as of a specific date
 */

export type LineupStatus = "active" | "temporary_absence" | "departed";

export interface MemberLineup {
  status: LineupStatus;
  startDate?: string | null;       // YYYY-MM-DD
  departureDate?: string | null;   // YYYY-MM-DD (when departed permanently)
  absenceStartDate?: string | null;// YYYY-MM-DD (start of temporary absence)
  absenceEndDate?: string | null;  // YYYY-MM-DD (end of temporary absence)
  notes?: string | null;           // reason, substitute notes, etc.
}

export interface MemberLineupMap {
  [bandName: string]: MemberLineup;
}

const LINEUP_TAG_REGEX = /<!--lineup:(\{.*?\})-->/;

/**
 * Parses member lineup data from BandMember notes and optional fields.
 */
export function parseMemberLineup(rawNotes: string | null | undefined): {
  cleanNotes: string;
  lineupByBand: MemberLineupMap;
} {
  if (!rawNotes) {
    return { cleanNotes: "", lineupByBand: {} };
  }

  const match = rawNotes.match(LINEUP_TAG_REGEX);
  if (!match || !match[1]) {
    return { cleanNotes: rawNotes, lineupByBand: {} };
  }

  try {
    const lineupByBand = JSON.parse(match[1]) as MemberLineupMap;
    const cleanNotes = rawNotes.replace(LINEUP_TAG_REGEX, "").trim();
    return { cleanNotes, lineupByBand };
  } catch {
    return { cleanNotes: rawNotes, lineupByBand: {} };
  }
}

/**
 * Serializes member lineup data into BandMember notes.
 */
export function serializeMemberLineupNotes(
  cleanNotes: string | null | undefined,
  lineupByBand: MemberLineupMap
): string {
  const clean = (cleanNotes || "").replace(LINEUP_TAG_REGEX, "").trim();
  const hasLineup = Object.keys(lineupByBand).length > 0;
  if (!hasLineup) return clean;

  const tag = `<!--lineup:${JSON.stringify(lineupByBand)}-->`;
  return clean ? `${clean}\n\n${tag}` : tag;
}

/**
 * Gets the lineup status for a specific band.
 */
export function getMemberLineupForBand(
  rawNotes: string | null | undefined,
  bandName: string
): MemberLineup {
  const { lineupByBand } = parseMemberLineup(rawNotes);
  return (
    lineupByBand[bandName] || {
      status: "active",
      startDate: null,
      departureDate: null,
      absenceStartDate: null,
      absenceEndDate: null,
      notes: null,
    }
  );
}

export interface AvailabilityResult {
  available: boolean;
  status: LineupStatus;
  reason?: string;
  badgeLabel?: string;
}

/**
 * Evaluates whether a member is active/available on a specific date (e.g. for a gig).
 * 
 * @param lineup Member's lineup config for the band
 * @param targetDate ISO string, Date, or null (defaults to today)
 */
export function evaluateMemberAvailability(
  lineup: MemberLineup | undefined,
  targetDate?: string | Date | null
): AvailabilityResult {
  if (!lineup || lineup.status === "active") {
    return { available: true, status: "active" };
  }

  const compareDateStr = targetDate
    ? (typeof targetDate === "string" ? targetDate.slice(0, 10) : targetDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  if (lineup.status === "departed") {
    if (lineup.departureDate) {
      if (compareDateStr >= lineup.departureDate) {
        return {
          available: false,
          status: "departed",
          reason: `Definitief gestopt sinds ${lineup.departureDate}`,
          badgeLabel: `Gestopt (${lineup.departureDate})`,
        };
      }
      // Before departure date: was still active!
      return { available: true, status: "active" };
    }
    return {
      available: false,
      status: "departed",
      reason: "Definitief gestopt",
      badgeLabel: "Gestopt",
    };
  }

  if (lineup.status === "temporary_absence") {
    const from = lineup.absenceStartDate;
    const until = lineup.absenceEndDate;

    if (from && until) {
      if (compareDateStr >= from && compareDateStr <= until) {
        return {
          available: false,
          status: "temporary_absence",
          reason: `Tijdelijk afwezig van ${from} t/m ${until}`,
          badgeLabel: `Afwezig (${from} - ${until})`,
        };
      }
      return { available: true, status: "active" };
    } else if (from && !until) {
      if (compareDateStr >= from) {
        return {
          available: false,
          status: "temporary_absence",
          reason: `Tijdelijk afwezig sinds ${from}`,
          badgeLabel: `Afwezig (vanaf ${from})`,
        };
      }
      return { available: true, status: "active" };
    } else if (!from && until) {
      if (compareDateStr <= until) {
        return {
          available: false,
          status: "temporary_absence",
          reason: `Tijdelijk afwezig tot ${until}`,
          badgeLabel: `Afwezig (tot ${until})`,
        };
      }
      return { available: true, status: "active" };
    }

    return {
      available: false,
      status: "temporary_absence",
      reason: "Tijdelijk afwezig",
      badgeLabel: "Afwezig",
    };
  }

  return { available: true, status: "active" };
}
