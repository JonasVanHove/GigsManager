import { prisma } from "@/lib/prisma";
import { inviteLink } from "@/lib/band-invites";

/**
 * Fields that describe money. A bandmate normally sees these — transparent
 * terms are the point of sharing — but the gig owner can hide them per gig.
 */
const FINANCIAL_FIELDS = [
  "performanceFee",
  "technicalFee",
  "managerBonusAmount",
  "technicalFeeClaimAmount",
] as const;

/**
 * Advances are tracked per musician, not per band: `advanceReceivedByManager`
 * is the manager's own bookkeeping and `advanceToMusicians` is the pool the
 * members share. Neither belongs in another member's view, so they are removed
 * for everyone who does not own the gig — regardless of the visibility flag.
 */
const PRIVATE_TO_OWNER = ["advanceReceivedByManager", "advanceToMusicians"] as const;

/**
 * Redacts a gig for a viewer who is not its owner.
 *
 * `canEdit` reflects the band leader's `canMembersEdit` switch and drives the
 * read/edit indicator in the UI; it never widens what data is returned.
 */
export function redactGigForBandmate<T extends Record<string, any>>(
  gig: T,
  options: { isOwner: boolean; canEdit: boolean }
): T & { sharedWithMe: boolean; canEdit: boolean } {
  if (options.isOwner) {
    return { ...gig, sharedWithMe: false, canEdit: true };
  }

  const redacted: Record<string, any> = { ...gig, sharedWithMe: true, canEdit: options.canEdit };

  // Advances are personal in both directions, always.
  for (const field of PRIVATE_TO_OWNER) redacted[field] = 0;

  if (gig.isFinancialHidden) {
    for (const field of FINANCIAL_FIELDS) redacted[field] = 0;
    // Payment/settlement flags describe the owner's bookkeeping too.
    redacted.paymentReceived = false;
    redacted.paymentReceivedDate = null;
    redacted.bandPaid = false;
    redacted.bandPaidDate = null;
  }

  return redacted as T & { sharedWithMe: boolean; canEdit: boolean };
}

/**
 * Gigs shared with the user because they play on them.
 *
 * A gig qualifies when one of the viewer's own BandMember rows is attached to
 * it. That is deliberately narrower than "every gig of the band": a bandmate
 * sees the shows they are actually on, not the whole tour history.
 */
export async function findSharedGigIds(userId: string): Promise<Set<string>> {
  const links = await prisma.gigBandMember.findMany({
    where: { bandMember: { userId } },
    select: { gigId: true },
  });
  return new Set(links.map((link) => link.gigId));
}

/**
 * Whether a bandmate may edit gigs that are shared with them, resolved once per
 * request instead of once per gig — the gigs list would otherwise be an N+1.
 */
export interface BandEditPermissions {
  /** Band names the viewer is listed in. */
  memberOf: Set<string>;
  /** Of those, the bands where the viewer is a leader. */
  leads: Set<string>;
  /** Bands whose owner opened the `canMembersEdit` switch. */
  editable: Set<string>;
}

export async function getBandEditPermissions(
  userId: string
): Promise<BandEditPermissions> {
  // BandMember.bands holds band *names*, so match on names rather than on a
  // relation that does not exist.
  const myMembers = await prisma.bandMember.findMany({
    where: { userId },
    select: { bands: true, isLeader: true },
  });

  const memberOf = new Set<string>();
  const leads = new Set<string>();
  for (const member of myMembers) {
    for (const name of Array.isArray(member.bands) ? member.bands : []) {
      memberOf.add(name);
      if (member.isLeader) leads.add(name);
    }
  }

  // Only bands the viewer actually belongs to can hand out edit access.
  const editable = new Set<string>();
  if (memberOf.size > 0) {
    const openBands = await prisma.bands.findMany({
      where: { name: { in: [...memberOf] }, canMembersEdit: true },
      select: { name: true },
    });
    for (const band of openBands) editable.add(band.name);
  }

  return { memberOf, leads, editable };
}

/**
 * Whether this viewer may edit a gig shared with them.
 *
 * Deliberately scoped to a single band. Leading band A must not grant edit
 * rights on gigs shared through band B, and `canMembersEdit` is a per-band
 * switch in the first place — an earlier "leader of any band" shortcut widened
 * both at once.
 */
export function canEditSharedGig(
  permissions: BandEditPermissions,
  bandName?: string | null
): boolean {
  if (!bandName || !permissions.memberOf.has(bandName)) return false;
  return permissions.leads.has(bandName) || permissions.editable.has(bandName);
}

/**
 * Checks whether a user is either the owner of a band or an assigned band leader.
 */
export async function isBandLeaderOrOwner(
  bandId: string,
  userId: string
): Promise<boolean> {
  const band = await prisma.bands.findUnique({
    where: { id: bandId },
    select: { id: true, name: true, userId: true },
  });
  if (!band) return false;
  if (band.userId === userId) return true;

  const member = await prisma.bandMember.findFirst({
    where: {
      userId,
      isLeader: true,
      bands: { has: band.name },
    },
    select: { id: true },
  });
  return Boolean(member);
}

/**
 * Checks whether a user is a member of the given band.
 */
export async function isBandMember(
  bandName: string,
  userId: string
): Promise<boolean> {
  const member = await prisma.bandMember.findFirst({
    where: {
      userId,
      bands: { has: bandName },
    },
    select: { id: true },
  });
  return Boolean(member);
}

export { inviteLink };