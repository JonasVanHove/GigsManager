import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

async function resolveValidBandIds(userId: string, bandIds: unknown): Promise<string[] | null> {
  if (bandIds === undefined) return null;
  if (!Array.isArray(bandIds)) throw new Error("bandIds must be an array");

  const normalizedBandIds = Array.from(new Set(
    bandIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  ));

  if (normalizedBandIds.length === 0) return [];

  const validBands = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM bands WHERE "userId" = ${userId} AND id IN (${Prisma.join(normalizedBandIds)})
  `);
  const validBandIdSet = new Set(validBands.map((b) => b.id));
  const invalidBandIds = normalizedBandIds.filter((id) => !validBandIdSet.has(id));
  if (invalidBandIds.length > 0) {
    throw new Error("One or more bands are invalid for this user");
  }

  return normalizedBandIds;
}

// GET: list songs for user with optional attachments
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const includeAttachments = searchParams.get("includeAttachments") === "true";

    const songs = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, title, notes, date, "userId", "createdAt", "updatedAt"
      FROM songs
      WHERE "userId" = ${user.id} AND "deletedAt" IS NULL
      ORDER BY date DESC
    `);

    let attachmentsBySong = new Map<string, any[]>();
    if (includeAttachments) {
      console.log('[DEBUG] Fetching attachments for user:', user.id);
      const attachments = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT sa.id, sa.storage_path AS "storagePath", sa.public_url AS "publicUrl", sa.content_type AS "contentType", sa.caption, sa."order", sa.roles, sa."songId"
        FROM song_attachments sa
        INNER JOIN songs s ON s.id = sa."songId"
        WHERE s."userId" = ${user.id} AND sa."deletedAt" IS NULL
        ORDER BY sa."order" ASC
      `);
      console.log('[DEBUG] Raw attachments from DB:', attachments.length, attachments);

      for (const a of attachments) {
        const list = attachmentsBySong.get(a.songId) ?? [];
        list.push({ id: a.id, storagePath: a.storagePath, publicUrl: a.publicUrl, contentType: a.contentType, caption: a.caption, order: a.order ?? 1, roles: a.roles || [] });
        attachmentsBySong.set(a.songId, list);
      }
      console.log('[DEBUG] Attachments by song map:', Object.fromEntries(attachmentsBySong));
    }

    // tags
    const tags = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT t.id, t.name, st."songId"
      FROM tags t
      INNER JOIN song_tags st ON st."tagId" = t.id
      INNER JOIN songs s ON s.id = st."songId"
      WHERE s."userId" = ${user.id}
      ORDER BY t.name ASC
    `);

    // bands
    const bands = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT b.id, b.name, sb."songId"
      FROM bands b
      INNER JOIN song_bands sb ON sb."bandId" = b.id
      INNER JOIN songs s ON s.id = sb."songId"
      WHERE s."userId" = ${user.id}
      ORDER BY b.name ASC
    `);

    const tagsBySong = new Map<string, any[]>();
    for (const t of tags) {
      const list = tagsBySong.get(t.songId) ?? [];
      list.push({ id: t.id, name: t.name });
      tagsBySong.set(t.songId, list);
    }

    const bandsBySong = new Map<string, any[]>();
    for (const b of bands) {
      const list = bandsBySong.get(b.songId) ?? [];
      list.push({ id: b.id, name: b.name });
      bandsBySong.set(b.songId, list);
    }

    const response = songs.map((s) => ({
      ...s,
      attachments: includeAttachments ? (attachmentsBySong.get(s.id) ?? []) : [],
      tags: tagsBySong.get(s.id) ?? [],
      bands: bandsBySong.get(s.id) ?? []
    }));
    console.log('[DEBUG] Final response songs with attachments:', response.length, response.map(s => ({ id: s.id, title: s.title, attachmentsCount: s.attachments?.length })));
    return NextResponse.json(response);
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
    const { title, notes, date, attachments, tags: incomingTags, bandIds } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const validatedBandIds = await resolveValidBandIds(user.id, bandIds);

    const inserted = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO songs (id, title, notes, date, "userId", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${title}, ${notes || null}, ${date ? new Date(date) : new Date()}, ${user.id}, NOW(), NOW())
      RETURNING id, title, notes, date, "userId", "createdAt", "updatedAt"
    `);

    const song = inserted[0];

    const createdAttachments: any[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        // Expect att to contain { storagePath, publicUrl, contentType, caption, order, roles }
        const id = crypto.randomUUID();
        const roles = Array.isArray(att.roles) ? att.roles : [];
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO song_attachments (id, "songId", storage_path, public_url, content_type, caption, "order", roles, "createdAt")
          VALUES (${id}, ${song.id}, ${att.storagePath}, ${att.publicUrl}, ${att.contentType}, ${att.caption || null}, ${att.order || 1}, ${roles}, NOW())
        `);
        createdAttachments.push({ id, storagePath: att.storagePath, publicUrl: att.publicUrl, contentType: att.contentType, caption: att.caption || null, order: att.order || 1, roles });
      }
    }

    // handle tags (create if missing + join)
    const createdTags: any[] = [];
    if (Array.isArray(incomingTags) && incomingTags.length > 0) {
      for (const tagName of incomingTags) {
        const tagId = crypto.randomUUID();
        // upsert-like: try insert, ignore if exists
        await prisma.$executeRaw(Prisma.sql`INSERT INTO tags (id, name, "userId", "createdAt") VALUES (${tagId}, ${tagName}, ${user.id}, NOW()) ON CONFLICT (id) DO NOTHING`);
        createdTags.push({ id: tagId, name: tagName });
        // join
        const stId = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`INSERT INTO song_tags (id, "songId", "tagId", "createdAt") VALUES (${stId}, ${song.id}, ${tagId}, NOW())`);
      }
    }

    // handle bands (associate by id)
    const createdBands: any[] = [];
    if (Array.isArray(validatedBandIds) && validatedBandIds.length > 0) {
      for (const bId of validatedBandIds) {
        const sbId = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`INSERT INTO song_bands (id, "songId", "bandId", "createdAt") VALUES (${sbId}, ${song.id}, ${bId}, NOW())`);
        createdBands.push({ id: bId });
      }
    }

    return NextResponse.json({ ...song, attachments: createdAttachments, tags: createdTags, bands: createdBands }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === "bandIds must be an array" || error.message === "One or more bands are invalid for this user")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    const { title, notes, date, attachments, tags: incomingTags, bandIds } = body;

    const user = await prisma.user.findUnique({ where: { supabaseId: userId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, title, notes, date FROM songs WHERE id = ${songId} AND "userId" = ${user.id} LIMIT 1
    `);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const currentSong = existing[0];
    const nextTitle = typeof title === "string" && title.trim().length > 0 ? title : currentSong.title;
    const nextNotes = notes === undefined ? currentSong.notes : (typeof notes === "string" && notes.trim().length > 0 ? notes : null);
    const nextDate = date ? new Date(date) : currentSong.date;

    const validatedBandIds = await resolveValidBandIds(user.id, bandIds);

    const updated = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      UPDATE songs
      SET title = ${nextTitle}, notes = ${nextNotes}, date = ${nextDate}, "updatedAt" = NOW()
      WHERE id = ${songId} AND "userId" = ${user.id}
      RETURNING id, title, notes, date, "userId", "createdAt", "updatedAt"
    `);

    const createdAttachments: any[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      // Replace attachments only when a new attachment list is supplied.
      await prisma.$executeRaw(Prisma.sql`
        UPDATE song_attachments SET "deletedAt" = NOW() WHERE "songId" = ${songId}
      `);

      for (const att of attachments) {
        const id = crypto.randomUUID();
        const roles = Array.isArray(att.roles) ? att.roles : [];
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO song_attachments (id, "songId", storage_path, public_url, content_type, caption, "order", roles, "createdAt")
          VALUES (${id}, ${songId}, ${att.storagePath}, ${att.publicUrl}, ${att.contentType}, ${att.caption || null}, ${att.order || 1}, ${roles}, NOW())
        `);
        createdAttachments.push({ id, storagePath: att.storagePath, publicUrl: att.publicUrl, contentType: att.contentType, caption: att.caption || null, order: att.order || 1, roles });
      }
    }

    const createdTags: any[] = [];
    if (Array.isArray(incomingTags) && incomingTags.length > 0) {
      // Replace tags only when a new tag list is supplied.
      await prisma.$executeRaw(Prisma.sql`DELETE FROM song_tags WHERE "songId" = ${songId}`);

      for (const tagName of incomingTags) {
        const tagId = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`INSERT INTO tags (id, name, "userId", "createdAt") VALUES (${tagId}, ${tagName}, ${user.id}, NOW()) ON CONFLICT (id) DO NOTHING`);
        const stId = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`INSERT INTO song_tags (id, "songId", "tagId", "createdAt") VALUES (${stId}, ${songId}, ${tagId}, NOW())`);
        createdTags.push({ id: tagId, name: tagName });
      }
    }

    const createdBands: any[] = [];
    if (Array.isArray(validatedBandIds)) {
      // Replace bands when a new band list is supplied, including an empty list.
      await prisma.$executeRaw(Prisma.sql`DELETE FROM song_bands WHERE "songId" = ${songId}`);

      for (const bId of validatedBandIds) {
        const sbId = crypto.randomUUID();
        await prisma.$executeRaw(Prisma.sql`INSERT INTO song_bands (id, "songId", "bandId", "createdAt") VALUES (${sbId}, ${songId}, ${bId}, NOW())`);
        createdBands.push({ id: bId });
      }
    }

    return NextResponse.json({
      ...updated[0],
      ...(Array.isArray(attachments) ? { attachments: createdAttachments } : {}),
      ...(Array.isArray(incomingTags) ? { tags: createdTags } : {}),
      ...(Array.isArray(validatedBandIds) ? { bands: createdBands } : {}),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "bandIds must be an array" || error.message === "One or more bands are invalid for this user")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
      SELECT id FROM songs WHERE id = ${songId} AND "userId" = ${user.id} LIMIT 1
    `);
    if (existing.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Soft-delete song and attachments (can be restored later)
    await prisma.$executeRaw(Prisma.sql`UPDATE songs SET "deletedAt" = NOW() WHERE id = ${songId} AND "userId" = ${user.id}`);
    await prisma.$executeRaw(Prisma.sql`UPDATE song_attachments SET "deletedAt" = NOW() WHERE "songId" = ${songId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/songs error:", error);
    return NextResponse.json({ error: "Failed to delete song" }, { status: 500 });
  }
}
