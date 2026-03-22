import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/api-auth";
import {
  getSharedGigFinancialSummary,
  normalizeShareLinkVisibility,
} from "@/lib/share-links";

function buildPublicGig(
  gig: {
    eventName: string;
    date: Date;
    bookingDate: Date;
    performers: string;
    notes: string | null;
    performanceFee: number;
    technicalFee: number;
    managerBonusType: string;
    managerBonusAmount: number;
    numberOfMusicians: number;
    claimPerformanceFee: boolean;
    claimTechnicalFee: boolean;
    technicalFeeClaimAmount: number | null;
    advanceReceivedByManager: number;
    advanceToMusicians: number;
    isCharity: boolean;
    performanceDistribution: string;
    managerPerformanceAmount: number | null;
    paymentReceived: boolean;
    bandPaid: boolean;
  },
  visibility: ReturnType<typeof normalizeShareLinkVisibility>
) {
  const financial = getSharedGigFinancialSummary(gig);

  return {
    eventName: visibility.showEventName ? gig.eventName : null,
    gigDate: visibility.showGigDate ? gig.date : null,
    bookingDate: visibility.showBookingDate ? gig.bookingDate : null,
    performers: visibility.showVenuePerformers ? gig.performers : null,
    notes: visibility.showNotes ? gig.notes : null,
    performanceFee: visibility.showPerformanceFee ? financial.performanceFee : null,
    perMusicianShare: visibility.showPerMusicianShare
      ? financial.perMusicianShare
      : null,
    managerEarnings: visibility.showManagerEarnings
      ? financial.managerEarnings
      : null,
    managerBonus: visibility.showManagerBonus ? financial.managerBonus : null,
    technicalFee: visibility.showTechnicalFee ? financial.technicalFee : null,
    totalCost: visibility.showTotalCost ? financial.totalCost : null,
    clientPaymentStatus: visibility.showClientPaymentStatus
      ? gig.paymentReceived
        ? "received"
        : "pending"
      : null,
    bandPaymentStatus: visibility.showBandPaymentStatus
      ? gig.bandPaid
        ? "paid"
        : "pending"
      : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  const token = params.identifier;

  try {
    const link = await prisma.shareLink.findUnique({
      where: { token },
      select: {
        token: true,
        title: true,
        createdAt: true,
        expiresAt: true,
        passwordHash: true,
        visibility: true,
        userId: true,
        selectionMode: true,
        includeArtists: true,
        autoIncludeNewGigs: true,
        gigs: {
          select: { gigId: true },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const now = new Date();
    if (link.expiresAt && link.expiresAt < now) {
      return NextResponse.json(
        { expired: true, message: "This link has expired." },
        { status: 410 }
      );
    }

    const isVerified =
      request.cookies.get(`share_link_verified_${link.token}`)?.value === "1";

    if (link.passwordHash && !isVerified) {
      return NextResponse.json(
        {
          passwordRequired: true,
          title: link.title,
          expiresAt: link.expiresAt,
        },
        { status: 401 }
      );
    }

    const visibility = normalizeShareLinkVisibility(link.visibility);

    let gigWhere:
      | {
          userId: string;
          performers?: { in: string[] };
          id?: { in: string[] };
        }
      | undefined;

    if (link.autoIncludeNewGigs && link.selectionMode === "all") {
      gigWhere = {
        userId: link.userId,
      };
    } else if (link.autoIncludeNewGigs && link.selectionMode === "artist") {
      gigWhere = {
        userId: link.userId,
        performers: { in: link.includeArtists },
      };
    } else {
      const selectedGigIds = Array.from(new Set(link.gigs.map((row) => row.gigId)));
      gigWhere = {
        userId: link.userId,
        id: { in: selectedGigIds },
      };
    }

    const selectedGigs = await prisma.gig.findMany({
      where: gigWhere,
      select: {
        eventName: true,
        date: true,
        bookingDate: true,
        performers: true,
        notes: true,
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
        isCharity: true,
        performanceDistribution: true,
        managerPerformanceAmount: true,
        paymentReceived: true,
        bandPaid: true,
      },
      orderBy: { date: "asc" },
    });

    const gigs = selectedGigs.map((gig) => buildPublicGig(gig, visibility));

    return NextResponse.json({
      token: link.token,
      title: link.title,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      visibility,
      passwordRequired: false,
      gigs,
    });
  } catch (error) {
    console.error("[GET /api/share-links/[identifier]]", error);
    return NextResponse.json(
      { error: "Failed to fetch share link" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  const authResult = await requireAuthUser(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const identifier = params.identifier;

  try {
    const link = await prisma.shareLink.findFirst({
      where: {
        userId: user.id,
        OR: [{ id: identifier }, { token: identifier }],
      },
      select: { id: true },
    });

    if (!link) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    await prisma.shareLink.delete({
      where: { id: link.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/share-links/[identifier]]", error);
    return NextResponse.json(
      { error: "Failed to delete share link" },
      { status: 500 }
    );
  }
}
