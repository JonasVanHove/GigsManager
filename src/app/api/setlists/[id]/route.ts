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
      // Reject nonsense BPM early: "120" and 120 are both valid, "abc" is not.
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const includeAttachments = searchParams.get("includeAttachments") === "true";

    const setlist = await (prisma.setlist.findFirst as any)({
      where: { id: params.id, userId: user.id },
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

    const updated = await (prisma.setlist.update as any)({
      where: { id: existing.id },
      data: {
        title,
        // The setlist meta (datum/locatie/notities/status) lives in `description`.
        // Assignments such as "Assign to Gig" only send gigIds, so an omitted
        // description must be preserved instead of wiped.
        description:
          body.description !== undefined
            ? String(body.description).trim() || null
            : (existing as any).description ?? null,
        status: body.status ? String(body.status).trim() : (existing as any).status || "concept",
        datum: body.datum !== undefined ? (body.datum ? String(body.datum).trim() : null) : (existing as any).datum,
        locatie: body.locatie !== undefined ? (body.locatie ? String(body.locatie).trim() : null) : (existing as any).locatie,
        bandId: body.bandId !== undefined ? (body.bandId || null) : (existing as any).bandId,
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
        gigs: { select: { id: true, eventName: true, date: true, bandId: true } },
        band: { select: { id: true, name: true, color: true, logoUrl: true } },
      },
    });

    if (Array.isArray(body.items)) {
      // Preserve existing attachments before deleting items
      const existingAttachments = await prisma.setlistItemAttachment.findMany({
        where: {
          setlistItemId: { in: existing.items.map((item: any) => item.id) },
        },
      });
      
      await prisma.setlistItem.deleteMany({ where: { setlistId: existing.id } });
      
      if (items.length > 0) {
        const createdItems = await prisma.setlistItem.createMany({
          data: items.map((item) => ({ ...item, setlistId: existing.id })),
        });
        
        // Get the newly created items to restore attachments
        const newItems = await prisma.setlistItem.findMany({
          where: { setlistId: existing.id },
          orderBy: { order: 'asc' },
        });
        
        // Restore attachments by matching order/index
        for (let i = 0; i < existingAttachments.length && i < newItems.length; i++) {
          const attachment = existingAttachments[i];
          const newItem = newItems[i];
          await prisma.setlistItemAttachment.update({
            where: { id: attachment.id },
            data: { setlistItemId: newItem.id },
          });
        }
      }
    }

    if (Array.isArray(body.gigIds)) {
      const gigIds = body.gigIds.filter((id: unknown) => typeof id === "string");
      const current = await (prisma.gig.findMany as any)({
        where: { setlistId: existing.id, userId: user.id },
        select: { id: true, bandId: true, date: true, eventName: true },
      });
      const currentIds = new Set(current.map((g: any) => g.id));
      const desiredIds = new Set(gigIds);

      const toAdd = gigIds.filter((id: string) => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter((id) => !desiredIds.has(id));

      if (toAdd.length > 0) {
        // Get bandId and details from the gigs being added
        const gigsToAdd = await (prisma.gig.findMany as any)({
          where: { id: { in: toAdd }, userId: user.id },
          select: { bandId: true, date: true, eventName: true },
        });
        
        // Auto-link band to setlist if gigs have a band and the client did not send one
        const bandIds = gigsToAdd.map((g: any) => g.bandId).filter((b: any) => b !== null);
        if (bandIds.length > 0 && !body.bandId) {
          // Use the first bandId (assuming gigs are for the same band)
          await (prisma.setlist.update as any)({
            where: { id: existing.id },
            data: { bandId: bandIds[0] },
          });
        }
        
        // Sync date and location from gig to setlist
        const firstGig = gigsToAdd[0];
        if (firstGig) {
          await (prisma.setlist.update as any)({
            where: { id: existing.id },
            data: {
              datum: firstGig.date.toISOString().split('T')[0],
              locatie: firstGig.eventName,
            },
          });
        }

        await prisma.gig.updateMany({
          where: { id: { in: toAdd }, userId: user.id },
          data: { setlistId: existing.id },
        });
      }

      if (toRemove.length > 0) {
        await prisma.gig.updateMany({
          where: { id: { in: toRemove as string[] }, userId: user.id },
          data: { setlistId: null },
        });
      }
    }

    const refreshed = await (prisma.setlist.findFirst as any)({
      where: { id: existing.id, userId: user.id },
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
