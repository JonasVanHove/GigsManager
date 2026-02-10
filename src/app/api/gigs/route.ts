import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader, getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Validation helper ────────────────────────────────────────────────────────

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

// ── Sanitize body → Prisma data ──────────────────────────────────────────────

function toGigData(body: Record<string, unknown>, userId: string) {
  return {
    eventName: String(body.eventName).trim(),
    date: new Date(new Date(String(body.date)).toISOString()), // UTC-safe
    performers: String(body.performers).trim(),
    numberOfMusicians: Math.max(1, Math.round(Number(body.numberOfMusicians))),
    performanceFee: Math.max(0, Number(body.performanceFee) || 0),
    technicalFee: Math.max(0, Number(body.technicalFee) || 0),
    managerBonusType: (body.managerBonusType as string) || "fixed",
    managerBonusAmount: Math.max(0, Number(body.managerBonusAmount) || 0),
    paymentReceived: Boolean(body.paymentReceived),
    paymentReceivedDate: body.paymentReceivedDate
      ? new Date(String(body.paymentReceivedDate))
      : null,
    bandPaid: Boolean(body.bandPaid),
    bandPaidDate: body.bandPaidDate ? new Date(String(body.bandPaidDate)) : null,
    notes: body.notes ? String(body.notes).trim() : null,
    userId,
  };
}

// ── GET /api/gigs ────────────────────────────────────────────────────────────
// Optional query params: ?take=50&skip=0 (pagination-ready)
// Requires: Authorization: Bearer <token>

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: missing token" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Unauthorized: invalid token" },
        { status: 401 }
      );
    }
    
    // Get or create user record
    const user = await getOrCreateUser(
      data.user.id,
      data.user.email || "",
      data.user.user_metadata?.name
    );
    
    return { user };
  } catch (err) {
    console.error("[Auth]", err);
    return NextResponse.json(
      { error: "Unauthorized: token validation failed" },
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

    const [gigs, total] = await Promise.all([
      prisma.gig.findMany({
        where: { userId: user.id },
        orderBy: { date: "desc" },
        take,
        skip,
      }),
      prisma.gig.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ data: gigs, total, take, skip });
  } catch (error) {
    console.error("[GET /api/gigs]", error);
    return NextResponse.json(
      { error: "Failed to fetch gigs" },
      { status: 500 }
    );
  }
}

// ── POST /api/gigs ───────────────────────────────────────────────────────────

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
    return NextResponse.json(gig, { status: 201 });
  } catch (error) {
    console.error("[POST /api/gigs]", error);
    return NextResponse.json(
      { error: "Failed to create gig" },
      { status: 500 }
    );
  }
}
