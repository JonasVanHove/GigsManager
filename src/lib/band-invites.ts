import { prisma } from "@/lib/prisma";

/**
 * Bandmate account sync and invite codes.
 *
 * A band member is created by whoever manages the band, which means the member
 * often has an email address long before they have a GigsManager account. The
 * member row therefore exists in an "unclaimed" state (`userId = null`) and is
 * claimed the moment somebody signs up with that address.
 */

// Ambiguous glyphs (0/O, 1/I) are left out: this code gets read aloud and
// typed by hand off a printed invite, not scanned by a machine.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Cryptographically random invite code, unbiased over the alphabet. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return code;
}

/**
 * Claims an unlinked member for a user whose email matches.
 *
 * Returns the updated member, or null when the member is already claimed by
 * someone else. Never steals an existing claim: two people can share a name
 * but an email address identifies exactly one account.
 */
export async function claimMemberForUser(
  memberId: string,
  userId: string,
  email: string
): Promise<{ id: string } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  // updateMany + a null guard makes this a compare-and-set: if two signups
  // race on the same address, exactly one update matches.
  const { count } = await prisma.bandMember.updateMany({
    where: { id: memberId, userId: null, email: normalized },
    data: { userId },
  });
  if (count === 0) return null;

  return { id: memberId };
}

/**
 * Auto-link on sign-up: claims every unclaimed member that matches the user's
 * email address.
 *
 * Called from getOrCreateUser, so it runs on the first authenticated request
 * after registration. Failures are swallowed by the caller — a failed claim
 * must never block someone from signing in.
 */
export async function claimUnclaimedMembersForUser(
  userId: string,
  email: string
): Promise<number> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 0;

  try {
    const unclaimed = await prisma.bandMember.findMany({
      where: { userId: null, email: normalized },
      select: { id: true },
    });
    let claimed = 0;
    for (const member of unclaimed) {
      const result = await claimMemberForUser(member.id, userId, normalized);
      if (result) claimed++;
    }
    if (claimed > 0) {
      console.log(`[band-invites] Claimed ${claimed} band member(s) for user on sign-in`);
    }
    return claimed;
  } catch (error) {
    console.warn("[band-invites] Failed to claim unclaimed members", error);
    return 0;
  }
}

/**
 * Links a freshly created or updated member to an existing account with the
 * same email. Returns the resolved userId (existing link, new link, or null).
 */
export async function resolveMemberUserId(
  memberId: string | null,
  email: string | null | undefined,
  currentUserId: string
): Promise<string> {
  const normalized = normalizeEmail(email);
  if (!normalized) return currentUserId;

  // Already linked to somebody else: respect that and do not re-point it.
  if (memberId) {
    const existing = await prisma.bandMember.findUnique({
      where: { id: memberId },
      select: { userId: true },
    });
    if (existing?.userId && existing.userId !== currentUserId) {
      return existing.userId;
    }
  }

  const owner = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });

  if (owner) {
    if (memberId) {
      await prisma.bandMember.updateMany({
        where: { id: memberId, userId: currentUserId },
        data: { userId: owner.id },
      });
    }
    return owner.id;
  }

  // No account with that address yet: stays unclaimed until they sign up.
  return currentUserId;
}

/**
 * Returns the band's invite code, generating one on first use.
 *
 * Retries on the (very unlikely) unique-collision rather than failing, because
 * a duplicate code would otherwise surface as a 500 to the user.
 */
export async function getOrCreateInviteCode(bandId: string): Promise<string | null> {
  const band = await prisma.bands.findUnique({
    where: { id: bandId },
    select: { inviteCode: true },
  });
  if (!band) return null;
  if (band.inviteCode) return band.inviteCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      const updated = await prisma.bands.updateMany({
        where: { id: bandId, inviteCode: null },
        data: { inviteCode: code },
      });
      if (updated.count > 0) return code;
      // Someone else won the race; re-read and use theirs.
      const fresh = await prisma.bands.findUnique({
        where: { id: bandId },
        select: { inviteCode: true },
      });
      if (fresh?.inviteCode) return fresh.inviteCode;
    } catch (error: any) {
      // P2002 = unique violation on a code that is already taken.
      if (error?.code === "P2002") continue;
      throw error;
    }
  }
  return null;
}

/**
 * Resolves an invite code to its band.
 *
 * Lives here rather than in the route file because Next.js rejects any export
 * from a route module that is not a HTTP verb or a config constant.
 */
export async function findBandByInviteCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== INVITE_CODE_LENGTH) return null;
  return prisma.bands.findUnique({
    where: { inviteCode: normalized },
    select: { id: true, name: true, color: true, logoUrl: true, userId: true },
  });
}

/** Public origin used to build shareable invite links. */
export function inviteLink(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://gigsmanager.app";
  return `${base}/join?code=${encodeURIComponent(code)}`;
}