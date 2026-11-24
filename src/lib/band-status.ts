/**
 * Band Status and Disbandment utilities.
 * 
 * Supports:
 * - "active" (Actief): Normal operating band
 * - "inactive" (Non-actief / Pauze): Temporarily on hold / paused
 * - "disbanded" (Gestopt / Beëindigd): Completely stopped / disbanded
 */

export type BandStatus = "active" | "inactive" | "disbanded";

export interface BandStatusDetails {
  status: BandStatus;
  disbandedAt?: string | null;
  statusNote?: string | null;
}

const STATUS_TAG_REGEX = /<!--band-status:(\{.*?\})-->/;

/**
 * Extracts band status details from band fields (status column or metadata in chatUrl/notes).
 */
export function parseBandStatus(band: {
  status?: string | null;
  disbandedAt?: Date | string | null;
  chatUrl?: string | null;
}): BandStatusDetails {
  // If status is explicitly present on band object
  if (band.status === "active" || band.status === "inactive" || band.status === "disbanded") {
    return {
      status: band.status,
      disbandedAt: band.disbandedAt ? new Date(band.disbandedAt).toISOString() : null,
    };
  }

  // Fallback to embedded metadata in chatUrl if column is not yet migrated
  if (band.chatUrl) {
    const match = band.chatUrl.match(STATUS_TAG_REGEX);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.status === "active" || parsed.status === "inactive" || parsed.status === "disbanded") {
          return {
            status: parsed.status,
            disbandedAt: parsed.disbandedAt || null,
            statusNote: parsed.statusNote || null,
          };
        }
      } catch {
        // ignore JSON parse error
      }
    }
  }

  return {
    status: "active",
    disbandedAt: null,
  };
}

/**
 * Encode status details into a string or returns clean fields.
 */
export function encodeBandStatusTag(details: BandStatusDetails): string {
  return `<!--band-status:${JSON.stringify(details)}-->`;
}

/**
 * Strips status tag from chatUrl for clean display.
 */
export function cleanChatUrl(chatUrl: string | null | undefined): string | null {
  if (!chatUrl) return null;
  const cleaned = chatUrl.replace(STATUS_TAG_REGEX, "").trim();
  return cleaned || null;
}

/**
 * Appends status tag to chatUrl for safe persistence.
 */
export function embedStatusInChatUrl(chatUrl: string | null | undefined, details: BandStatusDetails): string {
  const clean = cleanChatUrl(chatUrl) || "";
  const tag = encodeBandStatusTag(details);
  return clean ? `${clean}\n${tag}` : tag;
}
