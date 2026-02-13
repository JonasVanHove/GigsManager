import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateGigFinancials } from "@/lib/calculations";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const member = await prisma.bandMember.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Band member not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const gigIds = Array.isArray(body.gigIds)
      ? body.gigIds.filter((id: unknown) => typeof id === "string")
      : [];

    const gigs = await prisma.gig.findMany({
      where: {
        id: { in: gigIds },
        userId: user.id,
      },
    });

    const existing = await prisma.gigBandMember.findMany({
      where: { bandMemberId: member.id },
      select: { gigId: true },
    });

    const existingIds = new Set(existing.map((g) => g.gigId));
    const targetIds = new Set(gigs.map((g) => g.id));

    const toAdd = Array.from(targetIds).filter((id) => !existingIds.has(id));
    const toRemove = Array.from(existingIds).filter((id) => !targetIds.has(id));

    if (toRemove.length > 0) {
      await prisma.gigBandMember.deleteMany({
        where: {
          bandMemberId: member.id,
          gigId: { in: toRemove },
        },
      });
    }

    if (toAdd.length > 0) {
      const rows = gigs
        .filter((gig) => toAdd.includes(gig.id))
        .map((gig) => {
          const calc = calculateGigFinancials(
            gig.performanceFee,
            gig.technicalFee,
            gig.managerBonusType as "fixed" | "percentage",
            gig.managerBonusAmount,
            gig.numberOfMusicians,
            gig.claimPerformanceFee,
            gig.claimTechnicalFee,
            gig.technicalFeeClaimAmount,
            gig.advanceReceivedByManager,
            gig.advanceToMusicians,
            gig.isCharity
          );

          return {
            bandMemberId: member.id,
            gigId: gig.id,
            earnedAmount: calc.amountPerMusician,
            paidAmount: 0,
          };
        });

      await prisma.gigBandMember.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      success: true,
      added: toAdd.length,
      removed: toRemove.length,
    });
  } catch (error) {
    console.error("PUT /api/band-members/[id]/gigs error:", error);
    return NextResponse.json(
      { error: "Failed to update band member gigs" },
      { status: 500 }
    );
  }
}
