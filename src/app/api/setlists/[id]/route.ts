import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { invalidateCache } from "@/lib/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const setlist = await prisma.setlist.findFirst({
      where: { id: params.id, userId: user.id },
      include: {
        items: { orderBy: { order: "asc" } },
        gigs: { select: { id: true, eventName: true, date: true } },
      },
    });

    if (!setlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(setlist);
  } catch (error) {
    console.error("GET /api/setlists/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch setlist" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const body = await request.json();
    const existing = await prisma.setlist.findFirst({
      where: { id: params.id, userId: user.id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const title = body.title ? String(body.title).trim() : existing.title;
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const items = normalizeItems(itemsInput);

    const updated = await prisma.setlist.update({
      where: { id: existing.id },
      data: {
        title,
        description: body.description ? String(body.description).trim() : null,
      },
      include: {
        items: { orderBy: { order: "asc" } },
        gigs: { select: { id: true, eventName: true, date: true } },
      },
    });

    if (Array.isArray(body.items)) {
      await prisma.setlistItem.deleteMany({ where: { setlistId: existing.id } });
      if (items.length > 0) {
        await prisma.setlistItem.createMany({
          data: items.map((item) => ({ ...item, setlistId: existing.id })),
        });
      }
    }

    if (Array.isArray(body.gigIds)) {
      const gigIds = body.gigIds.filter((id: unknown) => typeof id === "string");
      const current = await prisma.gig.findMany({
        where: { setlistId: existing.id, userId: user.id },
        select: { id: true },
      });
      const currentIds = new Set(current.map((g) => g.id));
      const desiredIds = new Set(gigIds);

      const toAdd = gigIds.filter((id: string) => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter((id) => !desiredIds.has(id));

      if (toAdd.length > 0) {
        await prisma.gig.updateMany({
          where: { id: { in: toAdd }, userId: user.id },
          data: { setlistId: existing.id },
        });
      }

      if (toRemove.length > 0) {
        await prisma.gig.updateMany({
          where: { id: { in: toRemove }, userId: user.id },
          data: { setlistId: null },
        });
      }
    }

    const refreshed = await prisma.setlist.findFirst({
      where: { id: existing.id, userId: user.id },
      include: {
        items: { orderBy: { order: "asc" } },
        gigs: { select: { id: true, eventName: true, date: true } },
      },
    });

    invalidateCache(`${user.id}:setlists`);
    return NextResponse.json(refreshed ?? updated);
  } catch (error) {
    console.error("PATCH /api/setlists/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update setlist" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const existing = await prisma.setlist.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.setlist.delete({ where: { id: existing.id } });

    invalidateCache(`${user.id}:setlists`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/setlists/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete setlist" },
      { status: 500 }
    );
  }
}
