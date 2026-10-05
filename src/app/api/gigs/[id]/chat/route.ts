import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import {
  GIG_CHAT_MAX_CONTENT,
  GIG_CHAT_MESSAGE_LIMIT,
  authorizeGigChat,
  countUnreadMessages,
  getLastReadAt,
  getMemberIdsForUser,
  markGigChatRead,
  resolveChatAuthor,
} from "@/lib/gig-chat";

/**
 * v1.47.0 — in-app gig logistics chat.
 *
 * GET  /api/gigs/:id/chat              → newest messages + unread count for
 *                                         the caller. `?markRead=1` also bumps
 *                                         the caller's read marker (the modal
 *                                         does this on open and on each poll,
 *                                         which is what keeps the card badge
 *                                         in sync across devices).
 * POST /api/gigs/:id/chat { content }  → post a message.
 *
 * Access: the gig's owner or a bandmate rostered on the gig — the same rule as
 * the rest of the gig surface, enforced in `authorizeGigChat`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as {
    user: { id: string; email: string; name?: string | null };
  };

  try {
    const access = await authorizeGigChat(params.id, user.id);
    if (access.error) return access.error;
    const { gig } = access;

    const markRead = new URL(request.url).searchParams.get("markRead") === "1";
    const memberIds = await getMemberIdsForUser(user.id);
    const lastReadAt = markRead
      ? await markGigChatRead(gig.id, user.id)
      : await getLastReadAt(gig.id, user.id);

    const [rows, unreadCount] = await Promise.all([
      prisma.gigMessage.findMany({
        where: { gigId: gig.id },
        orderBy: { createdAt: "desc" },
        take: GIG_CHAT_MESSAGE_LIMIT,
        include: { author: { select: { id: true, name: true } } },
      }),
      countUnreadMessages(gig.id, user.id, memberIds, lastReadAt),
    ]);

    return NextResponse.json({
      gigId: gig.id,
      gigName: gig.eventName,
      // The query pages newest-first; render order is oldest-first.
      messages: rows.reverse().map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        author: row.author,
        isSelf: memberIds.includes(row.authorId),
      })),
      unreadCount,
    });
  } catch (error) {
    console.error(`[GET /api/gigs/${params.id}/chat]`, error);
    return NextResponse.json(
      { error: "Failed to load gig chat" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as {
    user: { id: string; email: string; name?: string | null };
  };

  try {
    const body = await request.json().catch(() => null);
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }
    if (content.length > GIG_CHAT_MAX_CONTENT) {
      return NextResponse.json(
        { error: `Message is too long (max ${GIG_CHAT_MAX_CONTENT} characters)` },
        { status: 400 }
      );
    }

    const access = await authorizeGigChat(params.id, user.id);
    if (access.error) return access.error;
    const { gig } = access;

    const author = await resolveChatAuthor(gig.id, user);
    const row = await prisma.gigMessage.create({
      data: { gigId: gig.id, authorId: author.id, content },
      include: { author: { select: { id: true, name: true } } },
    });

    // You have seen your own message the moment you send it.
    await markGigChatRead(gig.id, user.id);

    return NextResponse.json(
      {
        message: {
          id: row.id,
          content: row.content,
          createdAt: row.createdAt,
          author: row.author,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(`[POST /api/gigs/${params.id}/chat]`, error);
    return NextResponse.json(
      { error: "Failed to post message" },
      { status: 500 }
    );
  }
}
