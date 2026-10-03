import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getOrCreateInviteCode, inviteLink } from "@/lib/band-invites";
import { isBandLeaderOrOwner } from "@/lib/band-sharing";

export const runtime = "nodejs";

/**
 * POST /api/bands/[id]/regenerate-invite
 *
 * Rotates the band's invite code. The previous code stops resolving the moment
 * this returns, which is the whole point: a QR that got photographed or pasted
 * into a group chat can be invalidated.
 *
 * Only the band's owner may rotate it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const owner = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const band = await prisma.bands.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, userId: true },
    });
    if (!band) return NextResponse.json({ error: "Band not found" }, { status: 404 });

    const allowed = await isBandLeaderOrOwner(params.id, owner.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: Only band leaders or owners can regenerate invite codes" },
        { status: 403 }
      );
    }

    // Clearing the code first invalidates the old link; getOrCreateInviteCode
    // then allocates a fresh one (retrying on the rare unique collision).
    await prisma.bands.update({
      where: { id: params.id },
      data: { inviteCode: null },
    });

    const code = await getOrCreateInviteCode(params.id);
    if (!code) {
      return NextResponse.json(
        { error: "Could not generate an invite code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code,
      link: inviteLink(code),
      bandName: band.name,
      previousCodeInvalidated: true,
    });
  } catch (error) {
    console.error("POST /api/bands/[id]/regenerate-invite error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate invite code" },
      { status: 500 }
    );
  }
}