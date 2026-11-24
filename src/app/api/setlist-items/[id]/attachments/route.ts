import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateUser } from '@/lib/auth-helpers';
import {
  parseAttachmentSharingMeta,
  serializeAttachmentSharingDescription,
  canViewerAccessAttachment,
  AttachmentSharingScope,
} from '@/lib/setlist-attachments-sharing';

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getOrCreateUser(
    data.user.id,
    data.user.email || '',
    data.user.user_metadata?.name,
  );

  return { user };
}

async function resolveSetlistItemAccess(itemId: string, userId: string) {
  const p: any = prisma;
  const item = await p.setlistItem.findUnique({
    where: { id: itemId },
    include: {
      setlist: {
        include: { band: true },
      },
    },
  });

  if (!item) {
    return { errorResponse: NextResponse.json({ error: 'Setlist item not found' }, { status: 404 }) };
  }

  if (item.setlist.userId === userId) {
    return { item, isOwner: true };
  }

  if (item.setlist.band) {
    if (item.setlist.band.userId === userId) {
      return { item, isOwner: true };
    }

    const membership = await p.bandMember.findFirst({
      where: { userId, bands: { has: item.setlist.band.name } },
      select: { id: true },
    });

    if (membership) {
      return { item, isOwner: false, memberId: membership.id };
    }
  }

  return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  const access = await resolveSetlistItemAccess(params.id, user.id);
  if (access.errorResponse) return access.errorResponse;

  try {
    const p: any = prisma;
    const attachments = await p.setlistItemAttachment.findMany({
      where: { setlistItemId: params.id },
      orderBy: { order: 'asc' },
    });

    const myMemberships = await p.bandMember.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const myMemberIds = myMemberships.map((m: any) => m.id);

    const filtered = attachments
      .map((att: any) => {
        const { cleanDescription, meta } = parseAttachmentSharingMeta(att.description);
        const canAccess = canViewerAccessAttachment(meta, {
          userId: user.id,
          memberIds: myMemberIds,
        });

        if (!canAccess) return null;

        return {
          ...att,
          description: cleanDescription || null,
          sharing: meta || {
            userId: access.item?.setlist?.userId || user.id,
            scope: "band",
            sharedWith: [],
          },
          isOwn: meta ? meta.userId === user.id : att.setlistItem?.setlist?.userId === user.id,
        };
      })
      .filter(Boolean);

    return NextResponse.json(filtered);
  } catch (err) {
    console.error('[DEBUG Setlist Attachments API] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string; name?: string } };

  const access = await resolveSetlistItemAccess(params.id, user.id);
  if (access.errorResponse) return access.errorResponse;

  try {
    const body = await request.json();
    const { url, type, title, description, mimeType, fileSize, scope, sharedWith, instrument } = body;

    if (!url || !type) {
      return NextResponse.json({ error: 'Missing url or type' }, { status: 400 });
    }

    // Default to private as requested: "in de eerste instantie wel prive; want de bijlage van een drummer zou helemaal anders zijn als een gitarist bv."
    const sharingScope: AttachmentSharingScope =
      scope === "band" || scope === "selected" ? scope : "private";

    const sharingMeta = {
      userId: user.id,
      userName: user.name || "Bandlid",
      instrument: instrument || undefined,
      scope: sharingScope,
      sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
    };

    const serializedDescription = serializeAttachmentSharingDescription(
      description,
      sharingMeta
    );

    // Determine next order
    const p: any = prisma;
    const max = await p.setlistItemAttachment.aggregate({
      where: { setlistItemId: params.id },
      _max: { order: true },
    });
    const nextOrder = (max._max.order ?? 0) + 1;

    const created = await p.setlistItemAttachment.create({
      data: {
        setlistItemId: params.id,
        url: String(url),
        type: String(type),
        title: title ? String(title) : null,
        description: serializedDescription,
        mimeType: mimeType ? String(mimeType) : null,
        fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null,
        order: nextOrder,
      },
    });

    return NextResponse.json({
      ...created,
      description: description || null,
      sharing: sharingMeta,
      isOwn: true,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/setlist-items/[id]/attachments error:', err);
    return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 });
  }
}
