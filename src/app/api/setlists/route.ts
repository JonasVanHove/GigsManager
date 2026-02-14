import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCacheEntry, setCacheEntry, invalidateCache, getCacheKey } from "@/lib/cache";

type SetlistItemInput = {
  type?: string;
  title?: string;
  notes?: string;
  chords?: string;
  tuning?: string;
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
    const cacheKey = getCacheKey(user.id, "setlists");
    const cached = getCacheEntry<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const setlists = await prisma.setlist.findMany({
      where: { userId: user.id },
      include: {
        items: { orderBy: { order: "asc" } },
        gigs: { select: { id: true, eventName: true, date: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    setCacheEntry(cacheKey, setlists, 30);
    return NextResponse.json(setlists);
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

    const setlist = await prisma.setlist.create({
      data: {
        title,
        description: body.description ? String(body.description).trim() : null,
        userId: user.id,
        items: items.length
          ? {
              createMany: {
                data: items,
              },
            }
          : undefined,
      },
      include: {
        items: { orderBy: { order: "asc" } },
        gigs: { select: { id: true, eventName: true, date: true } },
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
