import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateGigFinancials } from "@/lib/calculations";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCacheEntry, setCacheEntry, invalidateCache, getCacheKey } from "@/lib/cache";

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

// GET /api/band-members - List all band members for current user
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    const cacheKey = getCacheKey(user.id, "band-members");
    const cached = getCacheEntry<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get all band members for this user with their gig participation
    const bandMembers = await prisma.bandMember.findMany({
      where: { userId: user.id },
      include: {
        gigs: {
          include: {
            gig: {
              select: {
                id: true,
                eventName: true,
                date: true,
                isCharity: true,
                performanceFee: true,
                technicalFee: true,
                managerBonusType: true,
                managerBonusAmount: true,
                numberOfMusicians: true,
                claimPerformanceFee: true,
                claimTechnicalFee: true,
                technicalFeeClaimAmount: true,
                advanceReceivedByManager: true,
                advanceToMusicians: true,
                paymentReceived: true,
                bandPaid: true,
                managerHandlesDistribution: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Calculate totals for each band member
    const bandMembersWithTotals = bandMembers.map((member) => {
      let totalEarned = 0;
      let totalReceived = 0;
      let totalPending = 0;

      const gigs = member.gigs.map((g) => {
        const gig = g.gig;
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

        const earned = gig.isCharity ? 0 : calc.amountPerMusician;
        const paidDirectlyComplete = !gig.managerHandlesDistribution && gig.paymentReceived;
        const received = gig.isCharity
          ? 0
          : (gig.bandPaid || paidDirectlyComplete
              ? earned
              : (gig.managerHandlesDistribution ? (g.paidAmount || 0) : 0));
        const pending = gig.isCharity
          ? 0
          : ((gig.bandPaid || paidDirectlyComplete)
              ? 0
              : (gig.managerHandlesDistribution
                  ? Math.max(0, earned - (g.paidAmount || 0))
                  : earned));

        totalEarned += earned;
        totalReceived += received;
        totalPending += pending;

        return {
          gigId: gig.id,
          gigName: gig.eventName,
          gigDate: gig.date,
          earned,
          paid: received,
        };
      });

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        notes: member.notes,
        bands: member.bands,
        updatedAt: member.updatedAt,
        totalEarned,
        totalPaid: totalReceived,
        totalOwed: totalPending,
        gigsCount: member.gigs.length,
        gigs,
      };
    });

    setCacheEntry(cacheKey, bandMembersWithTotals, 30);
    return NextResponse.json(bandMembersWithTotals);
  } catch (error) {
    console.error("GET /api/band-members error:", error);
    return NextResponse.json(
      { error: "Failed to fetch band members" },
      { status: 500 }
    );
  }
}

// POST /api/band-members - Create a new band member
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    const body = await req.json();
    const { name, email, phone, notes } = body;
    const bands = Array.isArray(body.bands)
      ? body.bands
          .filter((band: unknown) => typeof band === "string")
          .map((band: string) => band.trim())
          .filter((band: string) => band.length > 0)
      : [];

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create band member
    const bandMember = await prisma.bandMember.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        bands,
        userId: user.id,
      },
    });
    
    invalidateCache(`${user.id}:band-members`);
    return NextResponse.json(bandMember, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/band-members error:", error);
    
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A band member with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create band member" },
      { status: 500 }
    );
  }
}
