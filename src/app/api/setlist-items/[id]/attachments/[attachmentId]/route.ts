import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateUser } from '@/lib/auth-helpers';
import {
  parseAttachmentSharingMeta,
  serializeAttachmentSharingDescription,
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

async function resolveAttachmentAccess(itemId: string, attachmentId: string, userId: string) {
  const p: any = prisma;
  const attachment = await p.setlistItemAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      setlistItem: {
        include: {
          setlist: {
            include: { band: true },
          },
        },
      },
    },
  });

  if (!attachment || attachment.setlistItemId !== itemId) {
    return { errorResponse: NextResponse.json({ error: 'Attachment not found' }, { status: 404 }) };
  }

  const setlist = attachment.setlistItem?.setlist;
  const isSetlistOwner = setlist?.userId === userId || setlist?.band?.userId === userId;

  const { cleanDescription, meta } = parseAttachmentSharingMeta(attachment.description);
  const isUploader = meta ? meta.userId === userId : isSetlistOwner;

  return {
    attachment,
    cleanDescription,
    meta,
    isSetlistOwner,
    isUploader,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string; name?: string } };

  const access = await resolveAttachmentAccess(params.id, params.attachmentId, user.id);
  if (access.errorResponse) return access.errorResponse;

  if (!access.isUploader && !access.isSetlistOwner) {
    return NextResponse.json({ error: 'Forbidden: Only the uploader can update attachment sharing' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { scope, sharedWith, instrument, caption } = body;

    const currentMeta = access.meta || {
      userId: user.id,
      userName: user.name || "Bandlid",
      scope: "private" as AttachmentSharingScope,
      sharedWith: [],
    };

    const nextScope: AttachmentSharingScope =
      scope === "band" || scope === "selected" || scope === "private" ? scope : currentMeta.scope;

    const updatedMeta = {
      ...currentMeta,
      scope: nextScope,
      sharedWith: Array.isArray(sharedWith) ? sharedWith : currentMeta.sharedWith,
      instrument: instrument !== undefined ? instrument : currentMeta.instrument,
      caption: caption !== undefined ? caption : currentMeta.caption,
    };

    const newDescription = serializeAttachmentSharingDescription(
      access.cleanDescription,
      updatedMeta
    );

    const p: any = prisma;
    const updated = await p.setlistItemAttachment.update({
      where: { id: params.attachmentId },
      data: { description: newDescription },
    });

    return NextResponse.json({
      ...updated,
      description: access.cleanDescription || null,
      sharing: updatedMeta,
      isOwn: true,
    });
  } catch (err) {
    console.error('PATCH attachment sharing error:', err);
    return NextResponse.json({ error: 'Failed to update attachment' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  const access = await resolveAttachmentAccess(params.id, params.attachmentId, user.id);
  if (access.errorResponse) return access.errorResponse;

  if (!access.isUploader && !access.isSetlistOwner) {
    return NextResponse.json({ error: 'Forbidden: Only the uploader or setlist owner can delete this attachment' }, { status: 403 });
  }

  try {
    const p: any = prisma;
    await p.setlistItemAttachment.delete({
      where: { id: params.attachmentId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/setlist-items/[id]/attachments/[attachmentId] error:', err);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}
