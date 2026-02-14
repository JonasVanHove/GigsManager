/**
 * Export utilities for CSV and PDF generation of financial reports
 */

import type { Gig } from "@/types";
import { calculateGigFinancials } from "./calculations";

export interface ExportFormat {
  format: "csv" | "pdf";
}

/**
 * Generate CSV export of gigs with financial calculations
 */
export function generateGigsCsv(
  gigs: Gig[],
  fmtCurrency: (amount: number) => string
): string {
  const headers = [
    "Event Name",
    "Date",
    "Band",
    "Performance Fee",
    "Technical Fee",
    "Manager Bonus",
    "Total Received",
    "Your Earnings",
    "Owed to Others",
    "Status",
  ];

  const rows = gigs.map((gig) => {
    const calc = calculateGigFinancials(
      gig.performanceFee,
      gig.technicalFee,
      gig.managerBonusType,
      gig.managerBonusAmount,
      gig.numberOfMusicians,
      gig.claimPerformanceFee,
      gig.claimTechnicalFee,
      gig.technicalFeeClaimAmount,
      gig.advanceReceivedByManager,
      gig.advanceToMusicians,
      gig.isCharity
    );

    const status = gig.paymentReceived ? "Paid" : "Pending";

    return [
      `"${gig.eventName}"`,
      new Date(gig.date).toLocaleDateString("nl-NL"),
      `"${gig.performers}"`,
      gig.performanceFee.toFixed(2),
      gig.technicalFee.toFixed(2),
      calc.actualManagerBonus.toFixed(2),
      calc.totalReceived.toFixed(2),
      calc.myEarnings.toFixed(2),
      calc.amountOwedToOthers.toFixed(2),
      status,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate financial summary CSV
 */
export function generateFinancialSummaryCsv(
  gigs: Gig[],
  fmtCurrency: (amount: number) => string
): string {
  const groupedByBand: Record<
    string,
    { gigs: Gig[]; earnings: number; owed: number; paid: number }
  > = {};

  for (const gig of gigs) {
    const band = gig.performers || "Unknown";
    if (!groupedByBand[band]) {
      groupedByBand[band] = { gigs: [], earnings: 0, owed: 0, paid: 0 };
    }
    groupedByBand[band].gigs.push(gig);

    const calc = calculateGigFinancials(
      gig.performanceFee,
      gig.technicalFee,
      gig.managerBonusType,
      gig.managerBonusAmount,
      gig.numberOfMusicians,
      gig.claimPerformanceFee,
      gig.claimTechnicalFee,
      gig.technicalFeeClaimAmount,
      gig.advanceReceivedByManager,
      gig.advanceToMusicians,
      gig.isCharity
    );

    groupedByBand[band].earnings += calc.myEarnings;
    groupedByBand[band].owed += calc.amountOwedToOthers;
    if (gig.paymentReceived) {
      groupedByBand[band].paid += calc.myEarnings;
    }
  }

  const headers = [
    "Band",
    "Number of Gigs",
    "Total Earnings",
    "Amount Paid",
    "Outstanding",
    "Owed to Band",
  ];

  const rows = Object.entries(groupedByBand).map(([band, data]) => [
    `"${band}"`,
    data.gigs.length,
    data.earnings.toFixed(2),
    data.paid.toFixed(2),
    (data.earnings - data.paid).toFixed(2),
    data.owed.toFixed(2),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Trigger CSV download in browser
 */
export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate JSON for PDF export (can be used with libraries like jsPDF + autoTable)
 */
export function generateFinancialReportJson(
  gigs: Gig[],
  fmtCurrency: (amount: number) => string
) {
  const groupedByBand: Record<
    string,
    { gigs: Gig[]; earnings: number; owed: number }
  > = {};
  let totalEarnings = 0;
  let totalOwed = 0;

  for (const gig of gigs) {
    const band = gig.performers || "Unknown";
    if (!groupedByBand[band]) {
      groupedByBand[band] = { gigs: [], earnings: 0, owed: 0 };
    }
    groupedByBand[band].gigs.push(gig);

    const calc = calculateGigFinancials(
      gig.performanceFee,
      gig.technicalFee,
      gig.managerBonusType,
      gig.managerBonusAmount,
      gig.numberOfMusicians,
      gig.claimPerformanceFee,
      gig.claimTechnicalFee,
      gig.technicalFeeClaimAmount,
      gig.advanceReceivedByManager,
      gig.advanceToMusicians,
      gig.isCharity
    );

    groupedByBand[band].earnings += calc.myEarnings;
    groupedByBand[band].owed += calc.amountOwedToOthers;
    totalEarnings += calc.myEarnings;
    totalOwed += calc.amountOwedToOthers;
  }

  return {
    summary: {
      totalEarnings,
      totalOwed,
      gigCount: gigs.length,
      bandCount: Object.keys(groupedByBand).length,
    },
    byBand: groupedByBand,
    gigs: gigs.map((g) => ({
      ...g,
      calc: calculateGigFinancials(
        g.performanceFee,
        g.technicalFee,
        g.managerBonusType,
        g.managerBonusAmount,
        g.numberOfMusicians,
        g.claimPerformanceFee,
        g.claimTechnicalFee,
        g.technicalFeeClaimAmount,
        g.advanceReceivedByManager,
        g.advanceToMusicians,
        g.isCharity
      ),
    })),
  };
}
