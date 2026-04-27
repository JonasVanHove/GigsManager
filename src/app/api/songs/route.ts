import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

// GET: list songs for user with attachments
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const songs = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, title, notes, date, "userId", "createdAt", "updatedAt"
      FROM "Song"
      WHERE "userId" = ${user.id}
      ORDER BY date DESC
    `);

    const attachments = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT sa.id, sa.storage_path AS "storagePath", sa.public_url AS "publicUrl", sa.content_type AS "contentType", sa.caption, sa."songId"
      FROM song_attachments sa
      INNER JOIN songs s ON s.id = sa."songId"
      WHERE s."userId" = ${user.id}
      ORDER BY sa."createdAt" ASC
    `);

    const attachmentsBySong = new Map<string, any[]>();
    for (const a of attachments) {
      const list = attachmentsBySong.get(a.songId) ?? [];
      list.push({ id: a.id, storagePath: a.storagePath, publicUrl: a.publicUrl, contentType: a.contentType, caption: a.caption });
      attachmentsBySong.set(a.songId, list);
    }

    return NextResponse.json(songs.map((s) => ({ ...s, attachments: attachmentsBySong.get(s.id) ?? [] })));
  } catch (error) {
    console.error("GET /api/songs error:", error);
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 });
  }
}

// POST: create song with attachments metadata (attachments handled client-side)
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { title, notes, date, attachments } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const inserted = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "Song" (id, title, notes, date, "userId", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${title}, ${notes || null}, ${date ? new Date(date) : new Date()}, ${user.id}, NOW(), NOW())
      RETURNING id, title, notes, date, "userId", "createdAt", "updatedAt"
    `);

    const song = inserted[0];

    const createdAttachments: any[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        // Expect att to contain { storagePath, publicUrl, contentType, caption }
        const id = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO song_attachments (id, "songId", storage_path, public_url, content_type, caption, "createdAt")
          VALUES (${id}, ${song.id}, ${att.storagePath}, ${att.publicUrl}, ${att.contentType}, ${att.caption || null}, NOW())
        `);
        createdAttachments.push({ id, storagePath: att.storagePath, publicUrl: att.publicUrl, contentType: att.contentType, caption: att.caption || null });
      }
    }

    return NextResponse.json({ ...song, attachments: createdAttachments }, { status: 201 });
  } catch (error) {
    console.error("POST /api/songs error:", error);
    return NextResponse.json({ error: "Failed to create song" }, { status: 500 });
  }
}

// PATCH: update song metadata and attachments (replace attachments list)
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("id");
    if (!songId) return NextResponse.json({ error: "Song ID is required" }, { status: 400 });

    const body = await request.json();
    const { title, notes, date, attachments } = body;

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id FROM "Song" WHERE id = ${songId} AND "userId" = ${user.id} LIMIT 1
    `);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      UPDATE "Song"
      SET title = ${title || existing[0].title}, notes = ${notes || null}, date = ${date ? new Date(date) : new Date()}, "updatedAt" = NOW()
      WHERE id = ${songId} AND "userId" = ${user.id}
      RETURNING id, title, notes, date, "userId", "createdAt", "updatedAt"
    `);

    // Replace attachments: delete existing then insert provided
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM song_attachments WHERE "songId" = ${songId}
    `);

    const createdAttachments: any[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const id = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO song_attachments (id, "songId", storage_path, public_url, content_type, caption, "createdAt")
          VALUES (${id}, ${songId}, ${att.storagePath}, ${att.publicUrl}, ${att.contentType}, ${att.caption || null}, NOW())
        `);
        createdAttachments.push({ id, storagePath: att.storagePath, publicUrl: att.publicUrl, contentType: att.contentType, caption: att.caption || null });
      }
    }

    return NextResponse.json({ ...updated[0], attachments: createdAttachments });
  } catch (error) {
    console.error("PATCH /api/songs error:", error);
    return NextResponse.json({ error: "Failed to update song" }, { status: 500 });
  }
}

// DELETE: delete song and attachments
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("id");
    if (!songId) return NextResponse.json({ error: "Song ID is required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id FROM "Song" WHERE id = ${songId} AND "userId" = ${user.id} LIMIT 1
    `);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "Song" WHERE id = ${songId} AND "userId" = ${user.id}
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/songs error:", error);
    return NextResponse.json({ error: "Failed to delete song" }, { status: 500 });
  }
}
