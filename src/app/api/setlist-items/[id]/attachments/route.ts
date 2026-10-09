import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateUser } from '@/lib/auth-helpers';

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

async function requireSetlistItemOwnership(itemId: string, userId: string) {
  const p: any = prisma;
  const item = await p.setlistItem.findUnique({
    where: { id: itemId },
    include: { setlist: true },
  });

  if (!item) {
    return NextResponse.json({ error: 'Setlist item not found' }, { status: 404 });
  }

  if (item.setlist.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  const ownershipCheck = await requireSetlistItemOwnership(params.id, user.id);
  if (ownershipCheck) return ownershipCheck;

  try {
    console.log('[DEBUG Setlist Attachments API] Fetching attachments for item:', params.id);
    const p: any = prisma;
    const attachments = await p.setlistItemAttachment.findMany({
      where: { setlistItemId: params.id },
      orderBy: { order: 'asc' },
    });
    console.log('[DEBUG Setlist Attachments API] Found attachments:', attachments.length, attachments);
    return NextResponse.json(attachments);
  } catch (err) {
    console.error('[DEBUG Setlist Attachments API] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  const ownershipCheck = await requireSetlistItemOwnership(params.id, user.id);
  if (ownershipCheck) return ownershipCheck;

  try {
    const body = await request.json();
    const { url, type, title, description, mimeType, fileSize } = body;

    if (!url || !type) {
      return NextResponse.json({ error: 'Missing url or type' }, { status: 400 });
    }

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
        description: description ? String(description) : null,
        mimeType: mimeType ? String(mimeType) : null,
        fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null,
        order: nextOrder,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('POST /api/setlist-items/[id]/attachments error:', err);
    return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 });
  }
}
