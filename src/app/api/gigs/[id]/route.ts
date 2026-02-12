import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Auth middleware ──────────────────────────────────────────────────────────

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    const gig = await prisma.gig.findUnique({ where: { id: params.id } });
    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    
    // Check ownership
    if (gig.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    return NextResponse.json(gig);
  } catch (error) {
    console.error(`[GET /api/gigs/${params.id}]`, error);
    return NextResponse.json(
      { error: "Failed to fetch gig" },
      { status: 500 }
    );
  }
}

// ── PUT /api/gigs/:id ───────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    // Check ownership first
    const existing = await prisma.gig.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const gig = await prisma.gig.update({
      where: { id: params.id },
      data: {
        eventName: String(body.eventName).trim(),
        date: new Date(new Date(String(body.date)).toISOString()),
        performers: String(body.performers).trim(),
        numberOfMusicians: Math.max(1, Math.round(Number(body.numberOfMusicians))),
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
        bandPaidDate: body.bandPaidDate
          ? new Date(String(body.bandPaidDate))
          : null,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });

    return NextResponse.json(gig);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    console.error(`[PUT /api/gigs/${params.id}]`, error);
    return NextResponse.json(
      { error: "Failed to update gig" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/gigs/:id ─────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    // Check ownership first
    const existing = await prisma.gig.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.gig.delete({ where: { id: params.id } });
    return NextResponse.json({ message: "Gig deleted successfully" });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    console.error(`[DELETE /api/gigs/${params.id}]`, error);
    return NextResponse.json(
      { error: "Failed to delete gig" },
      { status: 500 }
    );
  }
}
