import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getOrCreateInviteCode, inviteLink, findBandByInviteCode } from "@/lib/band-invites";
import { isBandLeaderOrOwner, isBandMember } from "@/lib/band-sharing";

export const runtime = "nodejs";

/**
 * GET /api/bands/invite?code=XYZ123
 *
 * Preview shown on the join screen before the user commits. Deliberately
 * exposes only the band's name and artwork — never its gig list, fees or the
 * members' e-mail addresses.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getVerifiedUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const code = request.nextUrl.searchParams.get("code") || "";
    const band = await findBandByInviteCode(code);
    if (!band) {
      return NextResponse.json({ error: "Unknown invite code" }, { status: 404 });
    }

    // getUserIdFromHeader yields the Supabase id; the Prisma row is keyed on it.
    const viewer = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    // Already linked? Say so, so the UI can skip straight to the dashboard.
    const alreadyMember = viewer
      ? await prisma.bandMember.findFirst({
          where: { userId: viewer.id, bands: { has: band.name } },
          select: { id: true },
        })
      : null;

    return NextResponse.json({
      band: { id: band.id, name: band.name, color: band.color, logoUrl: band.logoUrl },
      alreadyMember: Boolean(alreadyMember),
    });
  } catch (error) {
    console.error("GET /api/bands/invite error:", error);
    return NextResponse.json({ error: "Failed to load invitation" }, { status: 500 });
  }
}

/**
 * POST /api/bands/invite  { bandId, regenerate? }
 *
 * Returns (and on first call creates) the band's invite code. Only the band's
 * owner may mint or rotate a code — a member must not be able to mint codes
 * for a band they do not run.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getVerifiedUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const bandId = String(body.bandId || "");
    if (!bandId) {
      return NextResponse.json({ error: "bandId is required" }, { status: 400 });
    }

    const owner = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const band = await prisma.bands.findUnique({
      where: { id: bandId },
      select: { id: true, name: true, userId: true, inviteCode: true },
    });
    if (!band) return NextResponse.json({ error: "Band not found" }, { status: 404 });

    const isLeaderOrOwnerUser = await isBandLeaderOrOwner(bandId, owner.id);

    if (body.regenerate) {
      if (!isLeaderOrOwnerUser) {
        return NextResponse.json(
          { error: "Forbidden: Only band leaders or owners can regenerate invite codes" },
          { status: 403 }
        );
      }
      if (band.inviteCode) {
        await prisma.bands.update({
          where: { id: bandId },
          data: { inviteCode: null },
        });
      }
    } else if (!isLeaderOrOwnerUser) {
      // Non-leader members view the invite code in read-only mode if code exists.
      const isMember = await isBandMember(band.name, owner.id);
      if (!isMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!band.inviteCode) {
        return NextResponse.json(
          { error: "No invite code generated yet. Ask a band leader to generate one." },
          { status: 403 }
        );
      }
      return NextResponse.json({
        code: band.inviteCode,
        link: inviteLink(band.inviteCode),
        bandName: band.name,
        readOnly: true,
      });
    }

    const code = await getOrCreateInviteCode(bandId);
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
      readOnly: !isLeaderOrOwnerUser,
    });
  } catch (error) {
    console.error("POST /api/bands/invite error:", error);
    return NextResponse.json({ error: "Failed to generate invite code" }, { status: 500 });
  }
}