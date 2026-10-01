import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCacheEntry, setCacheEntry, invalidateCache, getCacheKey, getApiCacheHeaders } from "@/lib/cache";

type SetlistItemInput = {
  type?: string;
  title?: string;
  notes?: string;
  chords?: string;
  tuning?: string;
  keySignature?: string;
  bpm?: number | string;
  order?: number;
};

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(
    data.user.id,
    data.user.email || "",
    data.user.user_metadata?.name
  );

  return { user };
}

function normalizeItems(items: SetlistItemInput[]) {
  return items
    .map((item, index) => ({
      type: item.type === "note" ? "note" : "song",
      title: item.title ? String(item.title).trim() : null,
      notes: item.notes ? String(item.notes).trim() : null,
      chords: item.chords ? String(item.chords).trim() : null,
      tuning: item.tuning ? String(item.tuning).trim() : null,
      keySignature: item.keySignature ? String(item.keySignature).trim() : null,
      bpm: (() => {
        const parsed = Number(item.bpm);
        return Number.isFinite(parsed) && parsed > 0 && parsed < 400
          ? Math.round(parsed)
          : null;
      })(),
      order: Number.isInteger(item.order) ? Number(item.order) : index + 1,
    }))
    .filter((item) => item.title || item.notes || item.chords || item.tuning);
}

// GET /api/setlists - list setlists
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const includeAttachments = searchParams.get("includeAttachments") === "true";

    const cacheKey = getCacheKey(user.id, "setlists", { includeAttachments });
    const cached = getCacheEntry<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: getApiCacheHeaders(30, "HIT") });
    }

    const setlists = await (prisma.setlist.findMany as any)({
      where: { userId: user.id },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: includeAttachments ? {
            attachments: {
              orderBy: { order: "asc" },
            },
          } : undefined,
        },
        gigs: { select: { id: true, eventName: true, date: true } },
        band: { select: { id: true, name: true, color: true, logoUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    setCacheEntry(cacheKey, setlists, 30);
    return NextResponse.json(setlists, { headers: getApiCacheHeaders(30, "MISS") });
  } catch (error) {
    console.error("GET /api/setlists error:", error);
    return NextResponse.json(
      { error: "Failed to fetch setlists" },
      { status: 500 }
    );
  }
}

// POST /api/setlists - create setlist
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const body = await request.json();
    const title = String(body.title || "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const items = normalizeItems(itemsInput);

    const setlist = await (prisma.setlist.create as any)({
      data: {
        title,
        description: body.description ? String(body.description).trim() : null,
        status: body.status ? String(body.status).trim() : "concept",
        datum: body.datum ? String(body.datum).trim() : null,
        locatie: body.locatie ? String(body.locatie).trim() : null,
        userId: user.id,
        bandId: body.bandId || null,
        items: items.length
          ? {
              createMany: {
                data: items,
              },
            }
          : undefined,
      },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: {
            attachments: {
              orderBy: { order: "asc" },
            },
          },
        },
        gigs: { select: { id: true, eventName: true, date: true } },
        band: { select: { id: true, name: true, color: true, logoUrl: true } },
      },
    });

    const gigIds = Array.isArray(body.gigIds)
      ? body.gigIds.filter((id: unknown) => typeof id === "string")
      : [];

    if (gigIds.length > 0) {
      await prisma.gig.updateMany({
        where: { id: { in: gigIds }, userId: user.id },
        data: { setlistId: setlist.id },
      });

      // Sync bandId from gigs to setlist if gigs have a band
      const gigs = await (prisma.gig.findMany as any)({
        where: { id: { in: gigIds }, userId: user.id },
        select: { bandId: true },
      });
      const bandIds = gigs.map((g: any) => g.bandId).filter((b: any) => b !== null);
      if (bandIds.length > 0 && !body.bandId) {
        await (prisma.setlist.update as any)({
          where: { id: setlist.id },
          data: { bandId: bandIds[0] },
        });
        setlist.bandId = bandIds[0];
      }
    }

    invalidateCache(`${user.id}:setlists`);
    return NextResponse.json(setlist, { status: 201 });
  } catch (error) {
    console.error("POST /api/setlists error:", error);
    return NextResponse.json(
      { error: "Failed to create setlist" },
      { status: 500 }
    );
  }
}
