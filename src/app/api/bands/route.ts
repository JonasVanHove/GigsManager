import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const bands = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, name, "logoUrl", color, "canMembersEdit" FROM bands WHERE "userId" = ${user.id} ORDER BY name ASC
    `);
    return NextResponse.json(bands);
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
    return NextResponse.json({ id, name, logoUrl, color }, { status: 201 });
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

    // Partial update: only touch the fields the caller actually sent. The
    // previous version always rewrote logoUrl/color, so saving one setting
    // silently reset the others to their defaults.
    const sets: string[] = [];
    const values: unknown[] = [];

    if ("logoUrl" in body) {
      sets.push('"logoUrl" = ?');
      values.push(body.logoUrl || null);
    }
    if ("color" in body) {
      sets.push("color = ?");
      values.push(body.color || "#6366f1");
    }
    if ("canMembersEdit" in body) {
      sets.push('"canMembersEdit" = ?');
      values.push(Boolean(body.canMembersEdit));
    }

    if (sets.length === 0) {
      return NextResponse.json(
        { error: "No supported fields to update" },
        { status: 400 }
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE bands SET ${sets.join(", ")}, "updatedAt" = NOW()
       WHERE id = $${sets.length + 1} AND "userId" = $${sets.length + 2}`,
      ...values,
      id,
      user.id
    );

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

    await prisma.$executeRaw`DELETE FROM bands WHERE id = ${id} AND "userId" = ${user.id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/bands error:", err);
    return NextResponse.json({ error: "Failed to delete band" }, { status: 500 });
  }
}
