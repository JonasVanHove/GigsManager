import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const bands = await prisma.$queryRaw<Array<any>>(`SELECT id, name FROM bands WHERE "userId" = $1 ORDER BY name ASC`, user.id);
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
    const { name } = body;
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const id = crypto.randomUUID();
    await prisma.$executeRaw`INSERT INTO bands (id, name, "userId", "createdAt") VALUES (${id}, ${name}, ${user.id}, NOW())`;
    return NextResponse.json({ id, name }, { status: 201 });
  } catch (err) {
    console.error("POST /api/bands error:", err);
    return NextResponse.json({ error: "Failed to create band" }, { status: 500 });
  }
}
