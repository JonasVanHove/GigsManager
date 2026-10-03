import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, validateTokenAndGetUser } from "@/lib/api-auth-helpers";
import {
  generateCalendarToken,
  hashCalendarToken,
} from "@/lib/ical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolves the caller, or returns the error response to send back. */
async function requireUser(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const authResult = await validateTokenAndGetUser(token);
  if ("error" in authResult) {
    return {
      error: NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      ),
    };
  }
  if ("degraded" in authResult) {
    return {
      error: NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      ),
    };
  }

  return { user: authResult.user };
}

/** Absolute feed URL, so the value can be pasted straight into a calendar app. */
function feedUrl(request: NextRequest, plaintext: string) {
  const origin =
    request.headers.get("origin") ||
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return `${origin}/api/calendar/${plaintext}`;
}

/**
 * POST /api/calendar/token — create or replace the caller's feed token.
 *
 * Only the hash is stored, so the plaintext can never be shown again. This is
 * therefore both "generate" and "regenerate"; POST always yields a fresh token,
 * which is exactly what rotating a leaked link needs.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.error) return auth.error;

    const plaintext = generateCalendarToken();
    const user = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        calendarToken: hashCalendarToken(plaintext),
        calendarTokenCreatedAt: new Date(),
      },
      select: { calendarTokenCreatedAt: true },
    });

    return NextResponse.json({
      token: plaintext,
      url: feedUrl(request, plaintext),
      createdAt: user.calendarTokenCreatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[POST /api/calendar/token]", err);
    return NextResponse.json(
      { error: "Failed to create calendar token" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/token — revoke the feed.
 *
 * The link stops working immediately because the lookup is by hash, and no
 * record of the old token survives anywhere.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.error) return auth.error;

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { calendarToken: null, calendarTokenCreatedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/calendar/token]", err);
    return NextResponse.json(
      { error: "Failed to revoke calendar token" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calendar/token — whether a feed exists.
 *
 * Deliberately reports only *that* a token is active, never the token itself:
 * the plaintext is unrecoverable by design, so this endpoint is safe to poll.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.error) return auth.error;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { calendarToken: true, calendarTokenCreatedAt: true },
    });

    return NextResponse.json({
      active: Boolean(user?.calendarToken),
      createdAt: user?.calendarTokenCreatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[GET /api/calendar/token]", err);
    return NextResponse.json(
      { error: "Failed to read calendar token state" },
      { status: 500 }
    );
  }
}
