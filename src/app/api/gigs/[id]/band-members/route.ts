import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The payout roster for one gig (v1.40.0).
 *
 * Returns the GigBandMember join rows — not the band members — because
 * participation and the fixed-amount override live on the join. `isSelf` marks
 * the row belonging to the caller so the read-only view can show just their own
 * line.
 *
 * Access mirrors the rest of the gig surface: the owner sees everything, a
 * bandmate sees the roster (they need it to know the split exists) but with the
 * gig's money redacted and no ability to change it.
 */
async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { getOrCreateUser } = await import("@/lib/auth-helpers");
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getOrCreateUser(
      data.user.id,
      data.user.email || "",
      data.user_metadata?.name
    );
    return { user };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const gig = await prisma.gig.findFirst({
      where: { id: params.id },
      select: { id: true, userId: true, bandId: true, isFinancialHidden: true },
    });
    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    const rows = await prisma.gigBandMember.findMany({
      where: { gigId: params.id },
      include: { bandMember: { select: { id: true, name: true, userId: true } } },
      orderBy: { createdAt: "asc" },
    });

    const isOwner = gig.userId === user.id;

    // A hidden gig exposes nothing — not the totals, not the overrides.
    if (gig.isFinancialHidden && !isOwner) {
      return NextResponse.json({ bandMembers: [], hidden: true });
    }

    const bandMembers = rows.map((row) => ({
      id: row.id,
      bandMemberId: row.bandMemberId,
      name: row.bandMember?.name ?? "Member",
      payoutIncluded: row.payoutIncluded,
      customPayoutAmount: row.customPayoutAmount,
      isSelf: row.bandMember?.userId === user.id,
    }));

    return NextResponse.json({ bandMembers, isOwner });
  } catch (error) {
    console.error(`[GET /api/gigs/${params.id}/band-members]`, error);
    return NextResponse.json(
      { error: "Failed to load band members" },
      { status: 500 }
    );
  }
}
