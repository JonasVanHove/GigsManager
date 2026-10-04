import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/cache";
import { calculateGigFinancials } from "@/lib/calculations";
import { Prisma } from "@prisma/client";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyPaymentReceived } from "@/lib/notification-service";
import { webhookPaymentReceived } from "@/lib/webhook-service";

// Auth middleware

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

// PUT /api/gigs/:id

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
    const isTentative = Boolean(body.isTentative);
    const hasBookingDate = Boolean(body.bookingDate && String(body.bookingDate).trim());

    // Only change the setlist link when the client actually sends the field.
    // Forms that don't manage setlists (the gig form) used to wipe the link on
    // every save because `body.setlistId` was always undefined -> null.
    let nextSetlistId: string | null = existing.setlistId;
    if (body.setlistId !== undefined) {
      if (body.setlistId) {
        const targetSetlistId = String(body.setlistId);
        const owned = await prisma.setlist.findFirst({
          where: { id: targetSetlistId, userId: user.id },
          select: { id: true },
        });
        if (!owned) {
          return NextResponse.json({ error: "Setlist not found" }, { status: 400 });
        }
        nextSetlistId = targetSetlistId;
      } else {
        nextSetlistId = null;
      }
    }

    const gig = await prisma.gig.update({
      where: { id: params.id },
      data: {
        eventName: String(body.eventName).trim(),
        date: new Date(new Date(String(body.date)).toISOString()),
        performers: String(body.performers).trim(),
        numberOfMusicians: Math.max(1, Math.round(Number(body.numberOfMusicians))),
        performanceLineup: body.performanceLineup
          ? String(body.performanceLineup).trim()
          : null,
        managerPerforms: body.managerPerforms !== false,
        isCharity: Boolean(body.isCharity),
        isTentative,
        performanceFee: Math.max(0, Number(body.performanceFee) || 0),
        performanceFeeUnknown: Boolean(body.performanceFeeUnknown),
        technicalFee: Math.max(0, Number(body.technicalFee) || 0),
        managerBonusType: (body.managerBonusType as string) || "fixed",
        managerBonusAmount: Math.max(0, Number(body.managerBonusAmount) || 0),
        claimPerformanceFee: body.claimPerformanceFee !== false,
        claimTechnicalFee: body.claimTechnicalFee !== false,
        technicalFeeClaimAmount: body.technicalFeeClaimAmount ? Number(body.technicalFeeClaimAmount) : null,
        managerHandlesDistribution: body.managerHandlesDistribution !== false,
        // Bandmates see the money unless the owner hides it for this gig.
        isFinancialHidden: Boolean(body.isFinancialHidden),
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
        bookingDate:
          hasBookingDate && !isTentative
            ? new Date(String(body.bookingDate))
            : existing.bookingDate,
        notes: body.notes ? String(body.notes).trim() : null,
        // --- Logistics (v1.31.0) ---
        venueName: body.venueName ? String(body.venueName).trim() : null,
        venueLocation: body.venueLocation ? String(body.venueLocation).trim() : null,
        soundcheckTime: body.soundcheckTime
          ? String(body.soundcheckTime).trim().slice(0, 5)
          : null,
        doorsOpenTime: body.doorsOpenTime
          ? String(body.doorsOpenTime).trim().slice(0, 5)
          : null,
        performanceDurationMinutes: (() => {
          const value = Number(body.performanceDurationMinutes);
          return Number.isFinite(value) && value > 0
            ? Math.min(1440, Math.round(value))
            : null;
        })(),
        gearSetupNotes: body.gearSetupNotes
          ? String(body.gearSetupNotes).trim()
          : null,
        // --- Organizer contact (v1.31.0) ---
        organizerName: body.organizerName
          ? String(body.organizerName).trim()
          : null,
        organizerEmail: body.organizerEmail
          ? String(body.organizerEmail).trim()
          : null,
        organizerPhone: body.organizerPhone
          ? String(body.organizerPhone).trim()
          : null,
        setlistId: nextSetlistId,
        bandId: body.bandId ? String(body.bandId) : null,
      },
    });
    invalidateCache(`${user.id}:gigs`);

    // Bidirectional sync: update linked setlist when gig changes
    if (gig.setlistId) {
      const setlistUpdateData: any = {};
      const dateChanged = existing.date.getTime() !== gig.date.getTime();
      const eventNameChanged = existing.eventName !== gig.eventName;
      
      if (dateChanged) {
        setlistUpdateData.datum = gig.date.toISOString().split('T')[0];
      }
      if (eventNameChanged) {
        setlistUpdateData.locatie = gig.eventName;
      }
      
      // Sync bandId if gig has a band and setlist doesn't
      const gigBandId = (gig as any).bandId;
      const existingBandId = (existing as any).bandId;
      if (gigBandId && !existingBandId) {
        setlistUpdateData.bandId = gigBandId;
      }
      
      if (Object.keys(setlistUpdateData).length > 0) {
        await prisma.setlist.update({
          where: { id: gig.setlistId },
          data: setlistUpdateData,
        });
        invalidateCache(`${user.id}:setlists`);
      }
    }

    // Trigger notifications and webhooks if payment status changed
    if (!existing.paymentReceived && body.paymentReceived) {
      // Payment just received - notify and webhook
      const amount = body.performanceFee || 0;
      notifyPaymentReceived(user.id, params.id, body.performers, amount).catch(err =>
        console.error("[notifyPaymentReceived]", err)
      );
      webhookPaymentReceived(user.id, body.performers, amount, new Date(body.paymentReceivedDate || new Date()).toISOString()).catch(err =>
        console.error("[webhookPaymentReceived]", err)
      );
    }

    if (Array.isArray(body.bandMemberIds)) {
      const bandMemberIds = body.bandMemberIds.filter(
        (id: unknown) => typeof id === "string"
      );

      const members = await prisma.bandMember.findMany({
        where: {
          id: { in: bandMemberIds },
          userId: user.id,
        },
      });

      const existingLinks = await prisma.gigBandMember.findMany({
        where: { gigId: gig.id },
        select: { bandMemberId: true, rsvpStatus: true, paidAmount: true },
      });
      const existingMap = new Map(existingLinks.map((l) => [l.bandMemberId, l]));

      await prisma.gigBandMember.deleteMany({
        where: { gigId: gig.id },
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
            paidAmount: existingMap.get(member.id)?.paidAmount ?? 0,
            rsvpStatus: existingMap.get(member.id)?.rsvpStatus ?? "PENDING",
          })),
          skipDuplicates: true,
        });
      }

    }

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

// DELETE /api/gigs/:id

/**
 * Partial update for the handful of fields that are edited outside the gig
 * form (currently just `notes`, from the quick-notes drawer).
 *
 * PUT is a full replace: it assigns every column from the request body, so a
 * `{ notes }`-only payload would blank the event name, date and fees. Anything
 * saving a single field must use PATCH.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: any };

  try {
    const existing = await prisma.gig.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data: Prisma.GigUpdateInput = {};

    // `null` clears the note, an empty/whitespace string is treated the same.
    if ("notes" in body) {
      const notes = body.notes ? String(body.notes).trim() : "";
      data.notes = notes.length > 0 ? notes : null;
    }

    // --- v1.40.0: gig-level cost accounting ---------------------------------
    // Each expense is coerced to a finite, non-negative number: a negative
    // expense is a data-entry slip, and storing it would inflate every payout
    // derived from the net.
    const EXPENSE_FIELDS = [
      "paExpenses",
      "travelExpenses",
      "otherExpenses",
      "commission",
    ] as const;
    for (const field of EXPENSE_FIELDS) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      data[field] = Number.isFinite(value) && value > 0 ? value : 0;
    }

    // The gross override is nullable: absent/null clears it and lets the gig
    // fall back to performanceFee + technicalFee. An explicit 0 is a real zero.
    if ("totalFeeOverride" in body) {
      const raw = body.totalFeeOverride;
      if (raw === null || raw === "") {
        data.totalFeeOverride = null;
      } else {
        const value = Number(raw);
        data.totalFeeOverride = Number.isFinite(value) && value > 0 ? value : 0;
      }
    }

    if (Object.keys(data).length === 0 && !("payouts" in body)) {
      return NextResponse.json(
        { error: "No supported fields to update" },
        { status: 400 }
      );
    }

    const gig =
      Object.keys(data).length > 0
        ? await prisma.gig.update({ where: { id: params.id }, data })
        : existing;

    // Per-member participation and fixed-amount overrides. Scoped to this gig
    // and matched on the join row, so a bandMemberId from another gig cannot be
    // touched through it.
    if (Array.isArray(body.payouts)) {
      const joinRows = await prisma.gigBandMember.findMany({
        where: { gigId: params.id },
        select: { id: true },
      });
      const allowed = new Set(joinRows.map((r) => r.id));

      await prisma.$transaction(
        body.payouts
          .filter(
            (p: any) => p && allowed.has(String(p.gigBandMemberId ?? ""))
          )
          .map((p: any) => {
            const amount =
              p.customPayoutAmount === null ||
              p.customPayoutAmount === undefined ||
              p.customPayoutAmount === ""
                ? null
                : Math.max(0, Number(p.customPayoutAmount) || 0);
            return prisma.gigBandMember.update({
              where: { id: String(p.gigBandMemberId) },
              data: {
                payoutIncluded: p.payoutIncluded !== false,
                customPayoutAmount: amount,
              },
            });
          })
      );
    }

    invalidateCache(`${user.id}:gigs`);

    return NextResponse.json({ gig });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    console.error(`[PATCH /api/gigs/${params.id}]`, error);
    return NextResponse.json(
      { error: "Failed to update gig" },
      { status: 500 }
    );
  }
}

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
    invalidateCache(`${user.id}:gigs`);
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
