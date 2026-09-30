import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateGigFinancials } from "@/lib/calculations";
import { requireSuperAdminUser } from "@/lib/superadmin-access";
import { DEMO_EMAIL } from "@/lib/demo-account";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toNumber(value: number | null | undefined): number {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

/**
 * Platform KPIs are reported without the public demo account by default, so
 * demo traffic never skews revenue / gig / user numbers. Superadmins can pass
 * ?includeDemo=true for a full audit ("Full Analysis Mode").
 */
function wantsDemoData(request: NextRequest): boolean {
  const raw = new URL(request.url).searchParams.get("includeDemo");
  return raw === "true" || raw === "1";
}

export async function GET(request: NextRequest) {
  try {
    const result = await requireSuperAdminUser(request);
    if ("error" in result) return result.error;

    const includeDemo = wantsDemoData(request);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const demoUser = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true, email: true },
    });
    const demoUserId = demoUser?.id ?? null;
    const excludeDemo = !includeDemo && Boolean(demoUserId);

    const userWhere = excludeDemo ? { id: { not: demoUserId! } } : {};
    const gigWhere = excludeDemo ? { userId: { not: demoUserId! } } : {};
    const bandWhere = excludeDemo ? { userId: { not: demoUserId! } } : {};

    const [
      totalUsers,
      totalBands,
      totalGigs,
      activeUsers,
      activeBands,
      totalRevenueGigs,
      latestUser,
      latestGig,
    ] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.bands.count({ where: bandWhere }),
      prisma.gig.count({ where: gigWhere }),
      prisma.user.count({
        where: {
          ...userWhere,
          OR: [
            { gigs: { some: {} } },
            { bandMembers: { some: {} } },
            { setlists: { some: {} } },
            { createdAt: { gte: ninetyDaysAgo } },
            { updatedAt: { gte: ninetyDaysAgo } },
          ],
        },
      }),
      prisma.bands.count({
        where: {
          ...bandWhere,
          OR: [
            { gigs: { some: {} } },
            { setlists: { some: {} } },
            { updatedAt: { gte: ninetyDaysAgo } },
          ],
        },
      }),
      prisma.gig.findMany({
        where: gigWhere,
        select: {
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
          paymentReceived: true,
          bandPaid: true,
          performanceDistribution: true,
          managerPerformanceAmount: true,
        },
      }),
      prisma.user.findFirst({
        where: userWhere,
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.gig.findFirst({
        where: gigWhere,
        orderBy: { createdAt: "desc" },
        select: { id: true, eventName: true, date: true, createdAt: true },
      }),
    ]);

    const totalRevenue = totalRevenueGigs.reduce((sum, gig) => {
      const calc = calculateGigFinancials(
        toNumber(gig.performanceFee),
        toNumber(gig.technicalFee),
        (gig.managerBonusType as "fixed" | "percentage") || "fixed",
        toNumber(gig.managerBonusAmount),
        toNumber(gig.numberOfMusicians),
        gig.claimPerformanceFee ?? true,
        gig.claimTechnicalFee ?? true,
        gig.technicalFeeClaimAmount ?? null,
        toNumber(gig.advanceReceivedByManager),
        toNumber(gig.advanceToMusicians),
        gig.isCharity ?? false,
        (gig.performanceDistribution as "equal" | "managerFixed" | "custom") || "equal",
        gig.managerPerformanceAmount ?? null
      );

      return sum + calc.totalReceived;
    }, 0);

    const receivedRevenue = totalRevenueGigs.reduce((sum, gig) => {
      const calc = calculateGigFinancials(
        toNumber(gig.performanceFee),
        toNumber(gig.technicalFee),
        (gig.managerBonusType as "fixed" | "percentage") || "fixed",
        toNumber(gig.managerBonusAmount),
        toNumber(gig.numberOfMusicians),
        gig.claimPerformanceFee ?? true,
        gig.claimTechnicalFee ?? true,
        gig.technicalFeeClaimAmount ?? null,
        toNumber(gig.advanceReceivedByManager),
        toNumber(gig.advanceToMusicians),
        gig.isCharity ?? false,
        (gig.performanceDistribution as "equal" | "managerFixed" | "custom") || "equal",
        gig.managerPerformanceAmount ?? null
      );

      const earned = gig.bandPaid ? calc.myEarnings : calc.myEarningsAlreadyReceived;
      return sum + earned;
    }, 0);

    const outstandingRevenue = totalRevenueGigs.reduce((sum, gig) => {
      const calc = calculateGigFinancials(
        toNumber(gig.performanceFee),
        toNumber(gig.technicalFee),
        (gig.managerBonusType as "fixed" | "percentage") || "fixed",
        toNumber(gig.managerBonusAmount),
        toNumber(gig.numberOfMusicians),
        gig.claimPerformanceFee ?? true,
        gig.claimTechnicalFee ?? true,
        gig.technicalFeeClaimAmount ?? null,
        toNumber(gig.advanceReceivedByManager),
        toNumber(gig.advanceToMusicians),
        gig.isCharity ?? false,
        (gig.performanceDistribution as "equal" | "managerFixed" | "custom") || "equal",
        gig.managerPerformanceAmount ?? null
      );

      return sum + (gig.bandPaid ? 0 : calc.myEarningsStillOwed);
    }, 0);

    // Numbers contributed by the demo account, reported so superadmins can see
// what is being excluded when they toggle demo data off.
    const demoSnapshot = demoUserId
      ? await (async () => {
          const [demoGigs, demoBands, demoSets] = await Promise.all([
            prisma.gig.count({ where: { userId: demoUserId } }),
            prisma.bands.count({ where: { userId: demoUserId } }),
            prisma.setlist.count({ where: { userId: demoUserId } }),
          ]);
          return {
            present: true,
            email: demoUser?.email ?? DEMO_EMAIL,
            gigs: demoGigs,
            bands: demoBands,
            setlists: demoSets,
            users: 1,
          };
        })()
      : { present: false, email: DEMO_EMAIL, gigs: 0, bands: 0, setlists: 0, users: 0 };

    return NextResponse.json({
      stats: {
        totalUsers,
        totalBands,
        totalGigs,
        activeUsers,
        inactiveUsers: Math.max(0, totalUsers - activeUsers),
        activeBands,
        inactiveBands: Math.max(0, totalBands - activeBands),
        totalRevenue,
        totalRevenueReceived: receivedRevenue,
        totalRevenueOutstanding: outstandingRevenue,
        totalRevenuePending: outstandingRevenue,
      },
      demo: {
        ...demoSnapshot,
        included: includeDemo,
        mode: includeDemo ? "full-analysis" : "production",
      },
      health: {
        database: "healthy",
        api: "healthy",
        lastUpdated: new Date().toISOString(),
      },
      recentActivity: {
        newestUser: latestUser,
        newestGig: latestGig,
      },
    });
  } catch (error) {
    console.error("GET /api/superadmin/stats error:", error);
    return NextResponse.json({ error: "Failed to load superadmin statistics" }, { status: 500 });
  }
}
