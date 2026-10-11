/**
 * Canonical band-roster view helpers.
 *
 * `GET /api/bands/[id]/members` is the single source of truth for who is in a
 * band. It returns every BandMember row for the band, ordered with leaders
 * first, and flags the signed-in viewer with `isCurrentUser`. These helpers
 * turn that payload into the list the UI renders so the roster looks identical
 * from every account.
 *
 * Historical note: BandsTab used to inject a synthetic `current-user` object in
 * client state. Because that object hard-coded `isLeader: true` and never
 * matched the real member row by reference, a joining member saw themselves
 * twice and the true leader's crown was hidden. The canonical roster already
 * contains the viewer, so no synthetic row is ever added here.
 */

/** Fields the roster route returns that the roster view needs to reason about. */
export interface RosterMember {
  id: string;
  name: string;
  email: string | null;
  isLeader?: boolean;
  /** Flagged by the API when this row is the signed-in viewer. */
  isCurrentUser?: boolean;
  /** Internal user id, stripped from the API payload but kept on legacy rows. */
  userId?: string | null;
}

export interface RosterViewer {
  id?: string | null;
  email?: string | null;
}

/** Synthetic ids that must never be treated as real member rows. */
const SYNTHETIC_MEMBER_IDS = new Set(["current-user"]);

/**
 * Decide whether a roster row represents the signed-in viewer. Mirrors the
 * identity chain the API uses: an explicit `isCurrentUser` flag first, then the
 * internal user id, then a case-insensitive e-mail match.
 */
export function isRosterMemberCurrentUser(
  member: RosterMember,
  viewer?: RosterViewer | null
): boolean {
  if (SYNTHETIC_MEMBER_IDS.has(member.id)) return true;
  if (member.isCurrentUser) return true;
  if (viewer?.id && member.userId && member.userId === viewer.id) return true;
  if (
    viewer?.email &&
    member.email &&
    member.email.toLowerCase() === viewer.email.toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * Build the member list for a band card from the canonical roster. The roster
 * is rendered verbatim so every account sees the same ordering; the only
 * transformation is honouring the "exclude me" preference, which removes the
 * viewer's own row without duplicating anyone.
 *
 * Generic over the member shape so callers keep their richer row type (the
 * render path relies on avatar/phone/bands fields beyond the identity fields).
 */
export function composeBandRoster<T extends RosterMember>(
  roster: T[] | null | undefined,
  viewer?: RosterViewer | null,
  options: { excludeSelf?: boolean } = {}
): T[] {
  const members = Array.isArray(roster) ? roster : [];
  if (!options.excludeSelf) return members;
  return members.filter((member) => !isRosterMemberCurrentUser(member, viewer));
}
