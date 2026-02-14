import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateGigFinancials } from "@/lib/calculations";
import { getUserIdFromHeader, getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCacheEntry, setCacheEntry, invalidateCache, getCacheKey } from "@/lib/cache";

// -- Validation helper --------------------------------------------------------

interface ValidationError {
  field: string;
  message: string;
}

function validateGigInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.eventName || typeof body.eventName !== "string" || !body.eventName.trim()) {
    errors.push({ field: "eventName", message: "Event name is required." });
  }
  if (!body.date) {
    errors.push({ field: "date", message: "Date is required." });
  } else if (isNaN(Date.parse(String(body.date)))) {
    errors.push({ field: "date", message: "Invalid date format." });
  }
  if (!body.performers || typeof body.performers !== "string" || !body.performers.trim()) {
    errors.push({ field: "performers", message: "Performers is required." });
  }

  const musicians = Number(body.numberOfMusicians);
  if (!musicians || musicians < 1 || !Number.isInteger(musicians)) {
    errors.push({ field: "numberOfMusicians", message: "Must be a whole number ≥ 1." });
  }

  const fee = Number(body.performanceFee);
  if (isNaN(fee) || fee < 0) {
    errors.push({ field: "performanceFee", message: "Must be ≥ 0." });
  }

  const techFee = Number(body.technicalFee);
  if (isNaN(techFee) || techFee < 0) {
    errors.push({ field: "technicalFee", message: "Must be ≥ 0." });
  }

  const bonusType = body.managerBonusType;
  if (bonusType && bonusType !== "fixed" && bonusType !== "percentage") {
    errors.push({ field: "managerBonusType", message: "Must be 'fixed' or 'percentage'." });
  }

  const bonusAmt = Number(body.managerBonusAmount);
  if (bonusAmt < 0) {
    errors.push({ field: "managerBonusAmount", message: "Must be ≥ 0." });
  }
  if (bonusType === "percentage" && bonusAmt > 100) {
    errors.push({ field: "managerBonusAmount", message: "Percentage must be ≤ 100." });
  }

  return errors;
}

// -- Sanitize body → Prisma data ----------------------------------------------

function toGigData(body: Record<string, unknown>, userId: string) {
  return {
    eventName: String(body.eventName).trim(),
    date: new Date(new Date(String(body.date)).toISOString()), // UTC-safe
    performers: String(body.performers).trim(),
    numberOfMusicians: Math.max(1, Math.round(Number(body.numberOfMusicians))),
    performanceLineup: body.performanceLineup
      ? String(body.performanceLineup).trim()
      : null,
    managerPerforms: body.managerPerforms !== false,
    isCharity: Boolean(body.isCharity),
    performanceFee: Math.max(0, Number(body.performanceFee) || 0),
    technicalFee: Math.max(0, Number(body.technicalFee) || 0),
    managerBonusType: (body.managerBonusType as string) || "fixed",
    managerBonusAmount: Math.max(0, Number(body.managerBonusAmount) || 0),
    claimPerformanceFee: body.claimPerformanceFee !== false,
    claimTechnicalFee: body.claimTechnicalFee !== false,
    technicalFeeClaimAmount: body.technicalFeeClaimAmount ? Number(body.technicalFeeClaimAmount) : null,
    managerHandlesDistribution: body.managerHandlesDistribution !== false,
    advanceReceivedByManager: Math.max(0, Number(body.advanceReceivedByManager) || 0),
    advanceToMusicians: Math.max(0, Number(body.advanceToMusicians) || 0),
    paymentReceived: Boolean(body.paymentReceived),
    paymentReceivedDate: body.paymentReceivedDate
      ? new Date(String(body.paymentReceivedDate))
      : null,
    bandPaid: Boolean(body.bandPaid),
    bandPaidDate: body.bandPaidDate ? new Date(String(body.bandPaidDate)) : null,
    notes: body.notes ? String(body.notes).trim() : null,
    setlistId: body.setlistId ? String(body.setlistId) : null,
    userId,
  };
}

// -- GET /api/gigs ------------------------------------------------------------
// Optional query params: ?take=50&skip=0 (pagination-ready)
// Requires: Authorization: Bearer <token>

async function requireAuth(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const logDebug = (...args: unknown[]) => {
    if (isDev) console.log(...args);
  };
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logDebug("[API Auth] Missing Authorization header");
    return NextResponse.json(
      { error: "Unauthorized: missing token" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  logDebug("[API Auth] Token received, length:", token.length);
  logDebug("[API Auth] Token starts with:", token.substring(0, 20));
  
  // Check environment
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  logDebug("[API Auth] SUPABASE_SERVICE_ROLE_KEY set:", hasServiceKey);
  
  try {
    logDebug("[API Auth] Calling supabaseAdmin.auth.getUser...");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.error("[API Auth] Supabase error:", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        fullError: JSON.stringify(error),
      });
      return NextResponse.json(
        { 
          error: "Unauthorized: invalid token", 
          details: error.message,
          status: (error as any).status,
          hasServiceKey,
        },
        { status: 401 }
      );
    }
    
    if (!data.user) {
      console.error("[API Auth] No user in response");
      return NextResponse.json(
        { error: "Unauthorized: no user data" },
        { status: 401 }
      );
    }
    
    logDebug("[API Auth] Token valid for user:", data.user.id);
    
    // Get or create user record
    const user = await getOrCreateUser(
      data.user.id,
      data.user.email || "",
      data.user.user_metadata?.name
    );
    
    logDebug("[API Auth] DB user ready:", user.id);
    return { user };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[API Auth] Exception during token validation:", {
      message: errorMsg,
      error: err,
      errorString: JSON.stringify(err),
    });
    return NextResponse.json(
      { error: "Unauthorized: token validation failed", details: errorMsg, hasServiceKey },
      { status: 401 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take")) || 100, 200);
    const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);

    const cacheKey = getCacheKey(user.id, "gigs", { take, skip });
    const cached = getCacheEntry<{ data: unknown; total: number; take: number; skip: number }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    const [gigs, total] = await Promise.all([
      prisma.gig.findMany({
        where: { userId: user.id },
        orderBy: { date: "desc" },
        take,
        skip,
      }),
      prisma.gig.count({ where: { userId: user.id } }),
    ]);

    const payload = { data: gigs, total, take, skip };
    setCacheEntry(cacheKey, payload, 15);
    return NextResponse.json(payload);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/gigs] Exception:", errorMsg, error);
    return NextResponse.json(
      { error: "Failed to fetch gigs", details: errorMsg },
      { status: 500 }
    );
  }
}

// -- POST /api/gigs -----------------------------------------------------------

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    const body = await request.json();
    const errors = validateGigInput(body);

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const gig = await prisma.gig.create({ data: toGigData(body, user.id) });
    invalidateCache(`${user.id}:gigs`);

    const bandMemberIds = Array.isArray(body.bandMemberIds)
      ? body.bandMemberIds.filter((id: unknown) => typeof id === "string")
      : [];

    if (bandMemberIds.length > 0) {
      const members = await prisma.bandMember.findMany({
        where: {
          id: { in: bandMemberIds },
          userId: user.id,
        },
      });

      if (members.length > 0) {
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

        await prisma.gigBandMember.createMany({
          data: members.map((member) => ({
            gigId: gig.id,
            bandMemberId: member.id,
            earnedAmount: calc.amountPerMusician,
            paidAmount: 0,
          })),
          skipDuplicates: true,
        });
      }
    }
    return NextResponse.json(gig, { status: 201 });
  } catch (error) {
    console.error("[POST /api/gigs]", error);
    return NextResponse.json(
      { error: "Failed to create gig" },
      { status: 500 }
    );
  }
}
