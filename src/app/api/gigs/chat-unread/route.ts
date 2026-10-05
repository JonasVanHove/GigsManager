import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { findSharedGigIds } from "@/lib/band-sharing";
import { getMemberIdsForUser } from "@/lib/gig-chat";

/**
 * v1.47.0 — batched unread counts for the gig chat badges.
 *
 * `GET /api/gigs/chat-unread?ids=<gigId,gigId,...>` returns
 * `{ counts: { [gigId]: number } }` for the ids the caller may actually see
 * (owner or rostered bandmate). One request feeds every GigCard on screen
 * instead of one request per card; the client store polls it every 30s.
 */
const MAX_IDS = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = [
      ...new Set(
        raw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ].slice(0, MAX_IDS);
    if (ids.length === 0) return NextResponse.json({ counts: {} });

    const gigs = await prisma.gig.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    const shared = await findSharedGigIds(user.id);
    const accessible = gigs
      .filter((gig) => gig.userId === user.id || shared.has(gig.id))
      .map((gig) => gig.id);
    if (accessible.length === 0) return NextResponse.json({ counts: {} });

    const memberIds = await getMemberIdsForUser(user.id);
    const reads = await prisma.gigChatRead.findMany({
      where: { gigId: { in: accessible }, userId: user.id },
      select: { gigId: true, lastReadAt: true },
    });
    const lastRead = new Map(
      reads.map((row) => [row.gigId, row.lastReadAt] as const)
    );

    const messages = await prisma.gigMessage.findMany({
      where: {
        gigId: { in: accessible },
        ...(memberIds.length > 0 ? { authorId: { notIn: memberIds } } : {}),
      },
      select: { gigId: true, createdAt: true },
    });

    const counts: Record<string, number> = {};
    for (const gigId of accessible) counts[gigId] = 0;
    for (const message of messages) {
      const since = lastRead.get(message.gigId) ?? new Date(0);
      if (message.createdAt > since) {
        counts[message.gigId] = (counts[message.gigId] ?? 0) + 1;
      }
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[GET /api/gigs/chat-unread]", error);
    return NextResponse.json(
      { error: "Failed to load unread counts" },
      { status: 500 }
    );
  }
}
