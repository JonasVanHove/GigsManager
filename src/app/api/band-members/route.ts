import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateGigFinancials } from "@/lib/calculations";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { resolveMemberUserId } from "@/lib/band-invites";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCacheEntry, setCacheEntry, invalidateCache, getCacheKey, getApiCacheHeaders } from "@/lib/cache";
import { isDbConnectionError, getErrorStatusCode, formatErrorResponse } from "@/lib/error-detection";

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[auth] Missing bearer token for /api/band-members");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      console.warn("[auth] Invalid or expired token for /api/band-members", { message: error?.message ?? "missing user" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const user = await getOrCreateUser(
        data.user.id,
        data.user.email || "",
        data.user.user_metadata?.name
      );

      return { user };
    } catch (dbErr) {
      console.error("[auth] Failed to load or create user for /api/band-members", dbErr);
      const statusCode = getErrorStatusCode(dbErr);
      const errorResponse = formatErrorResponse(dbErr);
      return NextResponse.json(errorResponse, { status: statusCode });
    }
  } catch (error) {
    console.error("[auth] Unexpected auth error for /api/band-members", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

// GET /api/band-members - List all band members for current user
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult as { user: { id: string } };
    if (!user?.id) {
      console.warn("[API /api/band-members Error]: Missing active user after auth check");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = getCacheKey(user.id, "band-members");
    const cached = getCacheEntry<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: getApiCacheHeaders(30, "HIT") });
    }

    let bandMembers: Array<any> = [];
    try {
      bandMembers = await prisma.bandMember.findMany({
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
    } catch (queryError) {
      console.error("[API /api/band-members Error]: Prisma query failed", {
        userId: user.id,
        message: queryError instanceof Error ? queryError.message : String(queryError),
        code: (queryError as any)?.code,
        stack: queryError instanceof Error ? queryError.stack : undefined,
      });
      return NextResponse.json(
        {
          error: "Failed to load band members",
          details: queryError instanceof Error ? queryError.message : String(queryError),
          type: "database_error",
        },
        { status: 500 }
      );
    }

    if (!Array.isArray(bandMembers) || bandMembers.length === 0) {
      console.info("[API /api/band-members] No active band members; returning empty list", { userId: user.id });
      return NextResponse.json([], { headers: getApiCacheHeaders(30, "MISS") });
    }

    const investedByMemberId = new Map<string, number>();
    try {
      const investmentRows = await prisma.$queryRaw<
        Array<{ amount: number; bandMemberId: string | null; contributorCount: number }>
      >(Prisma.sql`
        SELECT
          i.amount,
          ic."bandMemberId" AS "bandMemberId",
          contributor_counts.count AS "contributorCount"
        FROM "Investment" i
        LEFT JOIN (
          SELECT "investmentId", COUNT(*)::int AS count
          FROM "InvestmentContributor"
          GROUP BY "investmentId"
        ) contributor_counts ON contributor_counts."investmentId" = i.id
        LEFT JOIN "InvestmentContributor" ic ON ic."investmentId" = i.id
        WHERE i."userId" = ${user.id}
      `);

      for (const row of investmentRows) {
        if (!row.bandMemberId || row.contributorCount <= 0) continue;
        const perPersonShare = row.amount / (row.contributorCount + 1);
        investedByMemberId.set(
          row.bandMemberId,
          (investedByMemberId.get(row.bandMemberId) || 0) + perPersonShare
        );
      }
    } catch (investmentError) {
      console.warn("[API /api/band-members] Invested totals unavailable, continuing without them", investmentError);
    }

    const bandMembersWithTotals = bandMembers.map((member) => {
      let totalEarned = 0;
      let totalReceived = 0;
      let totalPending = 0;

      const gigs = (member.gigs || []).map((g: any) => {
        const gig = g?.gig;
        if (!gig) {
          return {
            gigId: g?.gigId ?? null,
            gigName: "Unknown gig",
            gigDate: null,
            earned: 0,
            paid: 0,
          };
        }

        const calc = calculateGigFinancials(
          Number(gig.performanceFee ?? 0),
          Number(gig.technicalFee ?? 0),
          (gig.managerBonusType as "fixed" | "percentage") || "fixed",
          Number(gig.managerBonusAmount ?? 0),
          Number(gig.numberOfMusicians ?? 0),
          Boolean(gig.claimPerformanceFee ?? true),
          Boolean(gig.claimTechnicalFee ?? true),
          gig.technicalFeeClaimAmount ?? null,
          Number(gig.advanceReceivedByManager ?? 0),
          Number(gig.advanceToMusicians ?? 0),
          Boolean(gig.isCharity ?? false)
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
        avatarUrl: member.avatarUrl,
        isLeader: Boolean(member.isLeader),
        bands: Array.isArray(member.bands) ? member.bands : [],
        updatedAt: member.updatedAt,
        totalEarned,
        totalInvested: investedByMemberId.get(member.id) || 0,
        totalPaid: totalReceived,
        totalOwed: totalPending,
        gigsCount: Array.isArray(member.gigs) ? member.gigs.length : 0,
        gigs,
      };
    });

    setCacheEntry(cacheKey, bandMembersWithTotals, 30);
    return NextResponse.json(bandMembersWithTotals, { headers: getApiCacheHeaders(30, "MISS") });
  } catch (error) {
    console.error("[API /api/band-members Error]:", error);
    const statusCode = getErrorStatusCode(error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

// POST /api/band-members - Create a new band member
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    const body = await req.json();
    const { name, email, phone, notes, avatarUrl } = body;
    const bands = Array.isArray(body.bands)
      ? body.bands
          .filter((band: unknown) => typeof band === "string")
          .map((band: string) => band.trim())
          .filter((band: string) => band.length > 0)
      : [];

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // If that e-mail already belongs to a GigsManager account, link the member
    // to it so the bandmate immediately sees their gigs. Otherwise the row
    // stays unclaimed until they sign up with the same address.
    const resolvedUserId = await resolveMemberUserId(null, email, user.id);

    // Create band member
    const bandMember = await prisma.bandMember.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        avatarUrl: typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
        isLeader: Boolean(body.isLeader),
        bands,
        userId: resolvedUserId,
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
