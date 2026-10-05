import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findSharedGigIds } from "@/lib/band-sharing";

/**
 * v1.47.0 — server-side helpers for the in-app gig logistics chat.
 *
 * Access mirrors the rest of the gig surface: the owner of the gig always has
 * access, and a bandmate has access when one of their own BandMember rows is
 * attached to the gig (`findSharedGigIds` — the same rule that decides which
 * gigs show up in their list at all).
 */

/** Hard cap on a single message; keeps runaway pastes out of the table. */
export const GIG_CHAT_MAX_CONTENT = 4000;

/** Newest N messages returned per load — a logistics chat is short by design. */
export const GIG_CHAT_MESSAGE_LIMIT = 200;

export interface GigChatGig {
  id: string;
  userId: string;
  eventName: string;
}

export type GigChatAccess =
  | { gig: GigChatGig; error?: undefined }
  | { gig?: undefined; error: NextResponse };

/** 404 when the gig does not exist, 403 when the caller may not see it. */
export async function authorizeGigChat(
  gigId: string,
  userId: string
): Promise<GigChatAccess> {
  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: { id: true, userId: true, eventName: true },
  });
  if (!gig) {
    return { error: NextResponse.json({ error: "Gig not found" }, { status: 404 }) };
  }
  if (gig.userId !== userId) {
    const shared = await findSharedGigIds(userId);
    if (!shared.has(gigId)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }
  return { gig };
}

/** All BandMember rows claimed by this account (an account may own several). */
export async function getMemberIdsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.bandMember.findMany({
    where: { userId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** Unread = messages after `lastReadAt` not written by the reader themselves. */
export async function countUnreadMessages(
  gigId: string,
  userId: string,
  memberIds: string[],
  lastReadAt: Date
): Promise<number> {
  return prisma.gigMessage.count({
    where: {
      gigId,
      createdAt: { gt: lastReadAt },
      ...(memberIds.length > 0 ? { authorId: { notIn: memberIds } } : {}),
    },
  });
}

/** Upsert the reader's "last seen" marker for this gig. */
export async function markGigChatRead(
  gigId: string,
  userId: string,
  at: Date = new Date()
): Promise<Date> {
  await prisma.gigChatRead.upsert({
    where: { gigId_userId: { gigId, userId } },
    create: { gigId, userId, lastReadAt: at },
    update: { lastReadAt: at },
  });
  return at;
}

export async function getLastReadAt(
  gigId: string,
  userId: string
): Promise<Date> {
  const row = await prisma.gigChatRead.findUnique({
    where: { gigId_userId: { gigId, userId } },
    select: { lastReadAt: true },
  });
  return row?.lastReadAt ?? new Date(0);
}

/**
 * The BandMember a message will be attributed to.
 *
 * Preference order: the member rostered on this gig, then any member row the
 * account already owns, and finally — for an owner who has no member row at
 * all — a personal row created on the fly. That fallback is deliberately NOT
 * linked to the gig's GigBandMember roster, so payouts and split calculations
 * are untouched; it only gives the message an author name.
 */
export async function resolveChatAuthor(
  gigId: string,
  user: { id: string; name?: string | null; email: string }
): Promise<{ id: string; name: string }> {
  const linked = await prisma.gigBandMember.findFirst({
    where: { gigId, bandMember: { userId: user.id } },
    select: { bandMember: { select: { id: true, name: true } } },
  });
  if (linked?.bandMember) return linked.bandMember;

  const owned = await prisma.bandMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (owned) return owned;

  const name = user.name?.trim() || user.email?.split("@")[0] || "Member";
  try {
    return await prisma.bandMember.create({
      data: { name, userId: user.id },
      select: { id: true, name: true },
    });
  } catch {
    // Lost a race with a concurrent first message — the row exists now.
    const existing = await prisma.bandMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    throw new Error("Could not resolve chat author");
  }
}
