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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  const ownershipCheck = await requireSetlistItemOwnership(params.id, user.id);
  if (ownershipCheck) return ownershipCheck;

  try {
    const body = await request.json();
    const order: string[] = Array.isArray(body.order) ? body.order : [];
    if (order.length === 0) {
      return NextResponse.json({ error: 'Order array required' }, { status: 400 });
    }

    // Update each attachment's order
    const p: any = prisma;
    const updates = order.map((id, idx) =>
      p.setlistItemAttachment.updateMany({
        where: { id, setlistItemId: params.id },
        data: { order: idx + 1 },
      })
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/setlist-items/[id]/attachments/reorder error:', err);
    return NextResponse.json({ error: 'Failed to reorder attachments' }, { status: 500 });
  }
}
