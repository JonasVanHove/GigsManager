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
  /** Which account administers this row (shared with virtual members). */
  userId?: string | null;
  phone?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  bands?: string[];
  updatedAt?: Date | string;
  claimed?: boolean;
}

export interface RosterViewer {
  id?: string | null;
  email?: string | null;
}

/** The band owner account (`bands.userId` resolved to a User). */
export interface RosterOwner extends RosterViewer {
  name?: string | null;
  /**
   * Owner profile image. Resolved server-side from the linked account's
   * Supabase profile (see `applyProfileAvatars`); when the viewer is the
   * owner, BandsTab additionally falls back to their session avatar.
   */
  avatarUrl?: string | null;
}

/**
 * Shared normalisation for e-mail identity keys. E-mail is the only reliable
 * per-person key across member rows, viewer sessions and linked accounts
 * (BandMember.userId is shared with virtual members), so every identity match
 * — including profile-avatar resolution — normalises through this function.
 */
export const rosterEmailKey = (email?: string | null): string =>
  (email || "").trim().toLowerCase();

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
  if (viewer?.email && rosterEmailKey(member.email) === rosterEmailKey(viewer.email)) return true;
  return false;
}

/**
 * Build the canonical, owner-inclusive roster for a band card.
 *
 * Guarantees, for every viewer:
 *   - the band owner (`owner.id`) appears exactly once as `isOwner` + `isLeader`;
 *   - every other member has `isOwner: false` and `isLeader` equal to their own
 *     stored flag (a promoted leader stays a leader, everyone else does not);
 *   - the viewer recognises themselves on exactly one row via `isCurrentUser`,
 *     whether they are the owner or joined through an invite.
 *
 * The owner is matched to their own member row by e-mail (the only reliable
 * per-person key); when no such row exists, the owner is projected from the
 * owner account rather than duplicating a virtual member that merely shares the
 * owner's userId.
 */
export function buildCanonicalBandRoster<T extends RosterMember>(
  members: T[] | null | undefined,
  options: { owner: RosterOwner; viewer?: RosterViewer | null; bandName: string }
): Array<T & { isLeader: boolean; isOwner: boolean; isCurrentUser: boolean; claimed: boolean }> {
  const rows = Array.isArray(members) ? members : [];
  const { owner, viewer, bandName } = options;
  const ownerEmail = rosterEmailKey(owner.email);
  const viewerEmail = rosterEmailKey(viewer?.email);
  const viewerIsOwner = Boolean(viewer?.id && owner.id && viewer.id === owner.id);

  // The owner's own member row, if present, is identified by e-mail — userId is
  // shared with virtual members and must not be used to pick "the owner row".
  const ownerRow = ownerEmail
    ? rows.find((m) => rosterEmailKey(m.email) === ownerEmail)
    : undefined;

  const roster: Array<T & { isLeader: boolean; isOwner: boolean; isCurrentUser: boolean; claimed: boolean }> =
    rows
      .filter((m) => m !== ownerRow)
      .map((m) => {
        const row = {
          ...m,
        } as T & { isLeader: boolean; isOwner: boolean; isCurrentUser: boolean; claimed: boolean };
        // Strip userId at runtime: the client must rely on the flags we compute,
        // never on the internal id (it is shared with every virtual member).
        delete (row as unknown as Record<string, unknown>).userId;
        row.isLeader = Boolean(m.isLeader);
        row.isOwner = false;
        // Only a regular row can be "me" when the viewer is NOT the owner: the
        // owner shares userId with every virtual member, so a userId match would
        // flag all of them. A joiner's userId is unique to their own row.
        row.isCurrentUser =
          !viewerIsOwner &&
          Boolean(
            (m.userId != null && viewer?.id && m.userId === viewer.id) ||
              (viewerEmail && rosterEmailKey(m.email) === viewerEmail)
          );
        row.claimed = Boolean(m.userId);
        return row;
      });

  // The owner is always present exactly once: their real row when it exists,
  // otherwise a projection from the owner account (never a persisted duplicate).
  if (ownerRow) {
    const ownerEntry = {
      ...ownerRow,
    } as T & { isLeader: boolean; isOwner: boolean; isCurrentUser: boolean; claimed: boolean };
    delete (ownerEntry as unknown as Record<string, unknown>).userId;
    ownerEntry.isLeader = true;
    ownerEntry.isOwner = true;
    ownerEntry.isCurrentUser =
      viewerIsOwner || (Boolean(viewerEmail) && rosterEmailKey(ownerRow.email) === viewerEmail);
    ownerEntry.claimed = true;
    roster.push(ownerEntry);
  } else {
    roster.push({
      ...({} as T),
      id: `owner-${owner.id ?? "unknown"}`,
      name: owner.name || owner.email?.split("@")[0] || "You",
      email: owner.email ?? null,
      phone: null,
      notes: null,
      avatarUrl: owner.avatarUrl ?? null,
      bands: [bandName],
      updatedAt: new Date().toISOString(),
      isLeader: true,
      isOwner: true,
      isCurrentUser: viewerIsOwner || (Boolean(viewerEmail) && ownerEmail === viewerEmail),
      claimed: true,
    } as T & { isLeader: boolean; isOwner: boolean; isCurrentUser: boolean; claimed: boolean });
  }

  // Leader first, then alphabetical — matching the original ordering contract.
  roster.sort((a, b) => {
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  return roster;
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

/**
 * Fill blank member avatars with the linked account's profile image — the
 * application-layer join with the account/user table. `BandMember` has no
 * database relation to `User` and `User` stores no avatar column, so the
 * roster route resolves profile images from Supabase auth
 * (`user_metadata.avatar_url`, keyed by e-mail) and passes them in here.
 *
 * Matching is done on e-mail only: `BandMember.userId` is shared with virtual
 * members, so a userId match would leak the owner's avatar onto unrelated
 * rows. A row's own stored `avatarUrl` always wins; rows without a stored
 * avatar and without a matching linked profile keep `null`, which the UI
 * renders as an initials badge.
 */
export function applyProfileAvatars<T extends RosterMember>(
  rows: T[],
  profileAvatars: ReadonlyMap<string, string>
): Array<T & { avatarUrl: string | null }> {
  return rows.map((row) => {
    const withAvatar = {
      ...row,
      avatarUrl:
        row.avatarUrl || profileAvatars.get(rosterEmailKey(row.email)) || null,
    } as T & { avatarUrl: string | null };
    return withAvatar;
  });
}
