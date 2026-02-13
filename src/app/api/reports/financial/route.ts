import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";
import { calculateGigFinancials } from "@/lib/calculations";

// GET /api/reports/financial - Generate comprehensive financial report
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const period = searchParams.get("period"); // 'month' | 'quarter' | 'year' | 'all'

    // Calculate date range
    let dateFilter: any = {};
    
    if (startDate && endDate) {
      dateFilter = {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };
    } else if (period) {
      const now = new Date();
      let startFrom = now;
      
      if (period === "month") {
        startFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === "quarter") {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startFrom = new Date(now.getFullYear(), quarterStart, 1);
      } else if (period === "year") {
        startFrom = new Date(now.getFullYear(), 0, 1);
      }
      
      if (period !== "all") {
        dateFilter = {
          date: {
            gte: startFrom,
            lte: now,
          },
        };
      }
    }

    // Fetch gigs
    const gigs = await prisma.gig.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      orderBy: {
        date: "desc",
      },
    });

    // Calculate financial data for each gig
    const gigsWithFinancials = gigs.map((gig) => {
      const financials = calculateGigFinancials(
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
        id: gig.id,
        eventName: gig.eventName,
        date: gig.date,
        isCharity: gig.isCharity,
        clientPaymentReceived: gig.paymentReceived,
        bandPaymentComplete: gig.bandPaid,
        revenue: financials.totalReceived,
        myEarnings: financials.myEarnings,
        owedToBand: financials.amountOwedToOthers,
      };
    });

    // Calculate summary statistics
    const totalRevenue = gigsWithFinancials.reduce((sum, g) => sum + g.revenue, 0);
    const totalMyEarnings = gigsWithFinancials.reduce((sum, g) => sum + g.myEarnings, 0);
    const totalOwedToBand = gigsWithFinancials.reduce((sum, g) => sum + g.owedToBand, 0);
    
    const charityGigsCount = gigsWithFinancials.filter((g) => g.isCharity).length;
    const paidGigsCount = gigsWithFinancials.length - charityGigsCount;
    
    const clientPaidCount = gigsWithFinancials.filter((g) => g.clientPaymentReceived).length;
    const clientUnpaidCount = gigsWithFinancials.length - clientPaidCount;
    
    const bandPaidCount = gigsWithFinancials.filter((g) => g.bandPaymentComplete).length;
    const bandUnpaidCount = gigsWithFinancials.length - bandPaidCount;

    // Monthly breakdown
    const monthlyBreakdown = gigsWithFinancials.reduce((acc: any[], gig) => {
      const date = new Date(gig.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthName = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });

      let monthData = acc.find((m) => m.month === monthName);
      if (!monthData) {
        monthData = {
          month: monthName,
          revenue: 0,
          myEarnings: 0,
          owedToBand: 0,
          gigsCount: 0,
        };
        acc.push(monthData);
      }

      monthData.revenue += gig.revenue;
      monthData.myEarnings += gig.myEarnings;
      monthData.owedToBand += gig.owedToBand;
      monthData.gigsCount += 1;

      return acc;
    }, []);

    return NextResponse.json({
      summary: {
        totalRevenue,
        totalMyEarnings,
        totalOwedToBand,
        charityGigsCount,
        paidGigsCount,
        totalGigsCount: gigsWithFinancials.length,
        clientPaidCount,
        clientUnpaidCount,
        bandPaidCount,
        bandUnpaidCount,
      },
      monthlyBreakdown,
      gigs: gigsWithFinancials,
    });
  } catch (error) {
    console.error("GET /api/reports/financial error:", error);
    return NextResponse.json(
      { error: "Failed to generate financial report" },
      { status: 500 }
    );
  }
}
