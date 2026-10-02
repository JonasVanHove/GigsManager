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

/** Whether any band this user is a member of lets members edit shared gigs. */
export async function canBandmateEdit(userId: string): Promise<boolean> {
  // BandMember.bands holds band *names*, so match on names rather than on a
  // relation that does not exist.
  const myMembers = await prisma.bandMember.findMany({
    where: { userId },
    select: { bands: true },
  });
  const names = new Set(
    myMembers.flatMap((m) => (Array.isArray(m.bands) ? m.bands : []))
  );
  if (names.size === 0) return false;

  const band = await prisma.bands.findFirst({
    where: { name: { in: [...names] }, canMembersEdit: true },
    select: { id: true },
  });
  return Boolean(band);
}

export { inviteLink };