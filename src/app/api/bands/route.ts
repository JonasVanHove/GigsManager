import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";
import { isBandLeaderOrOwner } from "@/lib/band-sharing";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Find bands where user is owner or member
    const myMembers = await prisma.bandMember.findMany({
      where: { userId: user.id },
      select: { bands: true, isLeader: true },
    });
    const memberBandNames = new Set(
      myMembers.flatMap((m) => (Array.isArray(m.bands) ? m.bands : []))
    );
    const leaderBandNames = new Set(
      myMembers
        .filter((m) => m.isLeader)
        .flatMap((m) => (Array.isArray(m.bands) ? m.bands : []))
    );

    const bands = await prisma.bands.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(memberBandNames.size > 0 ? [{ name: { in: Array.from(memberBandNames) } }] : []),
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        userId: true,
        logoUrl: true,
        color: true,
        canMembersEdit: true,
        inviteCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const bandsWithPermissions = bands.map((band) => {
      const isOwner = band.userId === user.id;
      const isLeader = isOwner || leaderBandNames.has(band.name);
      return {
        id: band.id,
        name: band.name,
        userId: band.userId,
        logoUrl: band.logoUrl,
        color: band.color,
        canMembersEdit: band.canMembersEdit,
        inviteCode: band.inviteCode,
        createdAt: band.createdAt,
        updatedAt: band.updatedAt,
        isOwner,
        isLeader,
      };
    });

    return NextResponse.json(bandsWithPermissions);
  } catch (err) {
    console.error("GET /api/bands error:", err);
    return NextResponse.json({ error: "Failed to load bands" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, logoUrl, color } = body;
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const id = crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO bands (id, name, "logoUrl", color, "userId", "createdAt") VALUES (${id}, ${name}, ${logoUrl || null}, ${color || '#6366f1'}, ${user.id}, NOW())`;
    return NextResponse.json({ id, name, logoUrl, color, isOwner: true, isLeader: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/bands error:", err);
    return NextResponse.json({ error: "Failed to create band" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Band ID required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Enforce band leader or owner permission
    const allowed = await isBandLeaderOrOwner(id, user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: Only band leaders or owners can update band settings" },
        { status: 403 }
      );
    }

    const data: { logoUrl?: string | null; color?: string; canMembersEdit?: boolean; name?: string } = {};
    if ("logoUrl" in body) data.logoUrl = body.logoUrl || null;
    if ("color" in body) data.color = body.color || "#6366f1";
    if ("canMembersEdit" in body) data.canMembersEdit = Boolean(body.canMembersEdit);
    if ("name" in body && body.name) data.name = body.name.trim();

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No supported fields to update" },
        { status: 400 }
      );
    }

    await prisma.bands.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/bands error:", err);
    return NextResponse.json({ error: "Failed to update band" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    if (!id) return NextResponse.json({ error: "Band ID required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const band = await prisma.bands.findUnique({ where: { id }, select: { userId: true } });
    if (!band) return NextResponse.json({ error: "Band not found" }, { status: 404 });
    if (band.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden: Only band owners can delete bands" }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM bands WHERE id = ${id} AND "userId" = ${user.id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/bands error:", err);
    return NextResponse.json({ error: "Failed to delete band" }, { status: 500 });
  }
}

