"use client";

import { useState, type KeyboardEvent } from "react";
import type { DashboardSummary, Gig } from "@/types";
import { calculateGigFinancials } from "@/lib/calculations";
import { XAITooltip } from "./XAITooltip";

interface DashboardSummaryProps {
  summary: DashboardSummary;
  gigs: Gig[];
  fmtCurrency: (amount: number) => string;
}

/**
 * DashboardSummary: Premium summary cards with band breakdown and expandable sections
 *
 * Features:
 * - Split view: Received vs Pending earnings
 * - Band breakdown: shows which bands contribute to totals
 * - Quick stats per band
 * - Expandable cards for progressive disclosure
 * - XAI tooltips for explanation
 * - HCI-optimized spacing and hierarchy
 */
export function DashboardSummary({ summary, gigs, fmtCurrency }: DashboardSummaryProps) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [expandedBand, setExpandedBand] = useState<string | null>(null);
  const [expandedUnpaidBand, setExpandedUnpaidBand] = useState<string | null>(null);
  const [expandedPerformanceType, setExpandedPerformanceType] = useState<string | null>(null);

  const toggleCard = (cardId: string) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
    setExpandedBand(null); // Reset band expansion when switching cards
    setExpandedUnpaidBand(null);
    setExpandedPerformanceType(null);
  };

  const toggleBand = (bandName: string) => {
    setExpandedBand(expandedBand === bandName ? null : bandName);
  };

  const toggleUnpaidBand = (bandName: string) => {
    setExpandedUnpaidBand(expandedUnpaidBand === bandName ? null : bandName);
  };

  const togglePerformanceType = (type: string) => {
    setExpandedPerformanceType(expandedPerformanceType === type ? null : type);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, cardId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleCard(cardId);
    }
  };

  // Calculate band breakdown
  const bandBreakdown = gigs.reduce(
    (acc, gig) => {
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

      const key = gig.performers || "Unknown Band";
      if (!acc[key]) {
        acc[key] = { earnings: 0, gigs: 0, received: 0, pending: 0, owed: 0 };
      }
      acc[key].earnings += calc.myEarnings;
      acc[key].gigs += 1;
      // Account for advances received
      const advanceAmount = gig.advanceReceivedByManager || 0;
      if (gig.paymentReceived) {
        acc[key].received += calc.myEarnings;
      } else {
        // Payment not yet received - calculate what's received vs pending
        acc[key].received += advanceAmount;
        acc[key].pending += calc.myEarnings - advanceAmount;
      }
      // Only count as owed if manager handles distribution
      if (gig.managerHandlesDistribution && !gig.bandPaid) {
        acc[key].owed += calc.amountOwedToOthers;
      }

      return acc;
    },
    {} as Record<string, { earnings: number; gigs: number; received: number; pending: number; owed: number }>
  );

  const sortedBands = Object.entries(bandBreakdown)
    .map(([band, data]): [string, typeof data & { totalReceived: number }] => [band, { ...data, totalReceived: data.received }])
    .sort((a, b) => b[1].totalReceived - a[1].totalReceived);

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* -- Main Grid: 1 column on mobile, 2x2 on desktop ----------------------- */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2">
        {/* Total Gigs Card - Expandable */}
        <div>
          <button
            onClick={() => toggleCard("performances")}
            type="button"
            className="w-full rounded-xl border-2 border-purple-400 bg-gradient-to-br from-purple-50 to-purple-50/50 p-2 sm:p-3 shadow-sm transition hover:shadow-md hover:border-purple-300 active:bg-purple-100/50 text-left dark:border-purple-600 dark:from-purple-900/20 dark:to-purple-900/10 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Performances
                </p>
                <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-bold text-purple-700 dark:text-purple-300">
                  {summary.totalGigs}
                </p>
                {expandedCard !== "performances" && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                    Click to see breakdown →
                  </p>
                )}
              </div>
              <svg
                className={`h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400 transition-transform flex-shrink-0 ${expandedCard === "performances" ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Expanded performances breakdown */}
          {expandedCard === "performances" && (
            <div className="mt-2 sm:mt-3 space-y-2 rounded-lg border border-purple-200 bg-white p-2 sm:p-3 dark:border-purple-800 dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-purple-50 dark:bg-purple-900/20 p-2">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Total</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-purple-900 dark:text-purple-200">{summary.totalGigs}</p>
                </div>
                <div className="rounded bg-green-50 dark:bg-green-900/20 p-2">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">Paid</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-green-900 dark:text-green-200">
                    {gigs.filter(g => g.paymentReceived).length}
                  </p>
                </div>
                <div className="rounded bg-orange-50 dark:bg-orange-900/20 p-2">
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Pending</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-orange-900 dark:text-orange-200">
                    {gigs.filter(g => !g.paymentReceived).length}
                  </p>
                </div>
                <div className="rounded bg-red-50 dark:bg-red-900/20 p-2">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Charity</p>
                  <p className="mt-1 text-base sm:text-lg font-bold text-red-900 dark:text-red-200">
                    {gigs.filter(g => g.isCharity).length}
                  </p>
                </div>
              </div>

              {/* By band breakdown */}
              <div className="border-t border-purple-200 dark:border-purple-800 pt-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-300 mb-2">
                  By Band
                </p>
                <div className="space-y-1">
                  {sortedBands.map(([band, data]) => (
                    <div key={`perf-${band}`} className="flex items-center justify-between text-xs rounded px-2 py-1.5 bg-slate-50 dark:bg-slate-700/50">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">{band}</p>
                      <p className="text-slate-600 dark:text-slate-400 flex-shrink-0 ml-2">{data.gigs}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Total Earnings Card - Expandable */}
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleCard("earnings")}
            onKeyDown={(event) => handleCardKeyDown(event, "earnings")}
            className="w-full rounded-xl border-2 border-brand-600 bg-gradient-to-br from-brand-600/10 to-brand-500/5 p-2 sm:p-3 shadow-sm transition hover:shadow-lg hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-brand-500 dark:from-brand-500/20 dark:to-brand-600/10 dark:hover:border-brand-400"
          >
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  My Earnings
                </p>
                <p className="mt-1 text-base sm:text-xl font-bold text-brand-800 dark:text-brand-300">
                  {fmtCurrency(summary.totalEarnings)}
                </p>
                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400 hidden sm:block">
                  Click to see breakdown →
                </p>
              </div>
              <div className="flex-shrink-0">
                <XAITooltip
                  title="My Earnings"
                  description="Total money you've earned from all performances based on claims and bonus settings."
                  tips={[
                    "Only includes fees & bonuses you claim",
                    "Updates when payment status changes",
                    "Click card to see received vs pending",
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Expanded earnings breakdown with band details */}
          {expandedCard === "earnings" && (
            <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-3">
              {/* Summary row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border-2 border-lime-500 bg-lime-500/10 p-2 sm:p-2.5 dark:border-lime-400 dark:bg-lime-500/20">
                  <p className="text-xs font-medium text-lime-700 dark:text-lime-300">
                    ✓ Received
                  </p>
                  <p className="mt-0.5 font-bold text-lime-800 dark:text-lime-200 text-sm sm:text-base">
                    {fmtCurrency(summary.totalEarningsReceived)}
                  </p>
                </div>
                <div className="rounded-lg border-2 border-orange-500 bg-orange-500/10 p-2 sm:p-2.5 dark:border-orange-400 dark:bg-orange-500/20">
                  <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                    ⏳ Pending
                  </p>
                  <p className="mt-0.5 font-bold text-orange-800 dark:text-orange-200 text-sm sm:text-base">
                    {fmtCurrency(summary.totalEarningsPending)}
                  </p>
                </div>
              </div>

              {/* Band breakdown */}
              <div className="max-h-48 sm:max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-2.5 dark:border-slate-700 dark:bg-slate-800/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400 sticky top-0 bg-slate-50 dark:bg-slate-800/50 py-1">
                  By Band
                </p>
                {sortedBands.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No bands yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {sortedBands.map(([band, data]) => (
                      <div key={band} className="rounded border border-slate-200 bg-white p-1.5 sm:p-2 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                              {band}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {data.gigs} gig{data.gigs !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                              {fmtCurrency(data.earnings)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              <span className="text-lime-600 dark:text-lime-400">{fmtCurrency(data.received)}</span>
                              {" / "}
                              <span className="text-orange-600 dark:text-orange-400">{fmtCurrency(data.pending)}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

        {/* Pending Payments Card */}
        <button
          onClick={() => toggleCard("pending")}
          type="button"
          className="rounded-xl border-2 border-orange-500 bg-orange-500/10 p-2 sm:p-3 shadow-sm transition hover:shadow-md hover:border-orange-400 active:bg-orange-500/20 text-left dark:border-orange-400 dark:bg-orange-500/15"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-700 dark:text-orange-300">
                Client Awaiting
              </p>
              <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-bold text-orange-800 dark:text-orange-200">
                {summary.pendingClientPayments}
              </p>
              {expandedCard === "pending" && (
                <div className="mt-2 sm:mt-3">
                  <p className="text-xs text-orange-600 dark:text-orange-400 mb-2 font-medium">
                    Gigs awaiting payment
                  </p>
                  {summary.pendingByBand.length > 0 && (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {summary.pendingByBand
                        .sort((a, b) => b.amount - a.amount)
                        .map((item) => {
                          const bandGigs = gigs.filter(
                            (g) => (g.performers || "Unknown Band") === item.band && !g.paymentReceived
                          );
                          const isExpanded = expandedBand === item.band;
                          const now = new Date();

                          return (
                            <div key={`band-${item.band}`}>
                              <button
                                onClick={() => toggleBand(item.band)}
                                type="button"
                                className="w-full flex items-center justify-between px-2 py-1.5 sm:py-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 cursor-pointer hover:bg-orange-500/20 dark:hover:bg-orange-500/30 active:bg-orange-500/30 dark:active:bg-orange-500/40 transition-colors gap-2 text-left border-0"
                              >
                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                  <svg
                                    className={`h-4 w-4 sm:h-5 sm:w-5 text-orange-700 dark:text-orange-300 transition-transform flex-shrink-0 ${
                                      isExpanded ? "rotate-90" : ""
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-orange-800 dark:text-orange-200 truncate">
                                      {item.band}
                                    </p>
                                    <p className="text-xs text-orange-600 dark:text-orange-400">
                                      {item.count} {item.count === 1 ? "gig" : "gigs"}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs sm:text-sm font-semibold text-orange-800 dark:text-orange-200 whitespace-nowrap flex-shrink-0">
                                  {fmtCurrency(item.amount)}
                                </p>
                              </button>

                              {isExpanded && (
                                <div className="mt-2 sm:mt-2.5 ml-4 sm:ml-5 space-y-1 border-l-2 border-orange-300 dark:border-orange-600 pl-2.5 sm:pl-3">
                                  {bandGigs.length === 0 ? (
                                    <p className="text-xs text-orange-600 dark:text-orange-400 italic py-1">
                                      No gigs found for this band
                                    </p>
                                  ) : (
                                    bandGigs
                                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                      .map((gig) => {
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
                                        const gigDate = new Date(gig.date);
                                        const isOverdue = gigDate < now && !gig.paymentReceived;

                                        return (
                                          <div
                                            key={gig.id}
                                            className={`rounded px-2 py-1.5 sm:py-2 text-xs ${
                                              isOverdue
                                                ? "bg-red-100 dark:bg-red-900/30 border-2 border-red-400 dark:border-red-600"
                                                : "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                                            }`}
                                          >
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                                              <div className="flex-1 min-w-0">
                                                <p
                                                  className={`font-semibold truncate ${
                                                    isOverdue
                                                      ? "text-red-800 dark:text-red-200"
                                                      : "text-orange-800 dark:text-orange-200"
                                                  }`}
                                                >
                                                  {gig.eventName || "Unnamed gig"}
                                                </p>
                                                <p
                                                  className={`text-xs mt-0.5 ${
                                                    isOverdue
                                                      ? "text-red-600 dark:text-red-400 font-semibold"
                                                      : "text-orange-600 dark:text-orange-400"
                                                  }`}
                                                >
                                                  {new Date(gig.date).toLocaleDateString("nl-NL", {
                                                    weekday: "short",
                                                    day: "numeric",
                                                    month: "short",
                                                  })}
                                                  {isOverdue && (
                                                    <span className="ml-1.5 font-bold text-red-700 dark:text-red-300">⚠ OVERDUE</span>
                                                  )}
                                                </p>
                                              </div>
                                              <p
                                                className={`font-bold whitespace-nowrap flex-shrink-0 ${
                                                  isOverdue
                                                    ? "text-red-800 dark:text-red-200 text-sm sm:text-base"
                                                    : "text-orange-800 dark:text-orange-200"
                                                }`}
                                              >
                                                {fmtCurrency(calc.myEarnings)}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <svg
              className={`h-5 w-5 sm:h-6 sm:w-6 text-orange-700 dark:text-orange-300 transition-transform flex-shrink-0 ${expandedCard === "pending" ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Outstanding to Band Card */}
        <button
          onClick={() => toggleCard("outstanding")}
          type="button"
          className="rounded-xl border-2 border-pink-500 bg-pink-500/10 p-2 sm:p-3 shadow-sm transition hover:shadow-md hover:border-pink-400 active:bg-pink-500/20 text-left dark:border-pink-400 dark:bg-pink-500/15"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-pink-700 dark:text-pink-300">
                Owe to Band
              </p>
              <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-bold text-pink-800 dark:text-pink-200">
                {fmtCurrency(summary.outstandingToBand)}
              </p>
            </div>
            <svg
              className={`h-5 w-5 sm:h-6 sm:w-6 text-pink-700 dark:text-pink-300 transition-transform flex-shrink-0 ${expandedCard === "outstanding" ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

      {/* -- Row 3: Expanded Payment Breakdowns --------------------------------- */}
      {expandedCard === "outstanding" && (
        <div className="space-y-2 rounded-xl border-2 border-pink-500 bg-pink-500/10 p-3 dark:border-pink-400 dark:bg-pink-500/15">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-300">
            Outstanding by Band
          </p>
          {sortedBands.filter(([_, data]) => data.owed > 0).length === 0 ? (
            <p className="text-xs text-pink-700 dark:text-pink-400">All obligations settled ✓</p>
          ) : (
            <div className="space-y-1.5">
              {sortedBands
                .filter(([_, data]) => data.owed > 0)
                .map(([band, data]) => (
                  <div key={`outstanding-${band}`} className="flex items-center justify-between rounded bg-white/50 p-2 dark:bg-slate-800/50">
                    <p className="truncate text-xs font-medium text-pink-900 dark:text-pink-200">
                      {band}
                    </p>
                    <p className="font-semibold text-pink-800 dark:text-pink-300">
                      {fmtCurrency(data.owed)}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {expandedCard === "pending" && (
        <div className="space-y-2 rounded-xl border-2 border-orange-500 bg-orange-500/10 p-3 dark:border-orange-400 dark:bg-orange-500/15">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600 dark:text-orange-300">
            Unpaid Gigs by Band
          </p>
          {sortedBands.filter(([_, data]) => data.earnings > data.received).length === 0 ? (
            <p className="text-xs text-orange-700 dark:text-orange-400">All payments received ✓</p>
          ) : (
            <div className="space-y-1.5">
              {sortedBands
                .filter(([_, data]) => data.earnings > data.received)
                .map(([band, data]) => {
                  const bandUnpaidGigs = gigs.filter(
                    (g) => (g.performers || "Unknown Band") === band && !g.paymentReceived
                  );
                  const isExpanded = expandedUnpaidBand === band;
                  const now = new Date();

                  return (
                    <div key={`unpaid-${band}`}>
                      <button
                        onClick={() => toggleUnpaidBand(band)}
                        type="button"
                        className="w-full flex items-center justify-between px-2 py-1.5 sm:py-2 rounded-lg bg-orange-500/20 dark:bg-orange-500/30 cursor-pointer hover:bg-orange-500/30 dark:hover:bg-orange-500/40 active:bg-orange-500/40 dark:active:bg-orange-500/50 transition-colors gap-2 text-left border-0"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <svg
                            className={`h-4 w-4 sm:h-5 sm:w-5 text-orange-700 dark:text-orange-300 transition-transform flex-shrink-0 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-orange-900 dark:text-orange-200 truncate">
                              {band}
                            </p>
                            <p className="text-xs text-orange-700 dark:text-orange-400">
                              {data.gigs} gig{data.gigs !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-orange-900 dark:text-orange-200 whitespace-nowrap flex-shrink-0">
                          {fmtCurrency(data.earnings - data.received)}
                        </p>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 sm:mt-2.5 ml-4 sm:ml-5 space-y-1 border-l-2 border-orange-300 dark:border-orange-600 pl-2.5 sm:pl-3">
                          {bandUnpaidGigs.length === 0 ? (
                            <p className="text-xs text-orange-600 dark:text-orange-400 italic py-1">
                              No unpaid gigs for this band
                            </p>
                          ) : (
                            bandUnpaidGigs
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                              .map((gig) => {
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
                                const gigDate = new Date(gig.date);
                                const isOverdue = gigDate < now && !gig.paymentReceived;

                                return (
                                  <div
                                    key={gig.id}
                                    className={`rounded px-2 py-1.5 sm:py-2 text-xs ${
                                      isOverdue
                                        ? "bg-red-100 dark:bg-red-900/30 border-2 border-red-400 dark:border-red-600"
                                        : "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                                    }`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className={`font-semibold truncate ${
                                            isOverdue
                                              ? "text-red-800 dark:text-red-200"
                                              : "text-orange-800 dark:text-orange-200"
                                          }`}
                                        >
                                          {gig.eventName || "Unnamed gig"}
                                        </p>
                                        <p
                                          className={`text-xs mt-0.5 ${
                                            isOverdue
                                              ? "text-red-600 dark:text-red-400 font-semibold"
                                              : "text-orange-600 dark:text-orange-400"
                                          }`}
                                        >
                                          {new Date(gig.date).toLocaleDateString("nl-NL", {
                                            weekday: "short",
                                            day: "numeric",
                                            month: "short",
                                          })}
                                          {isOverdue && (
                                            <span className="ml-1.5 font-bold text-red-700 dark:text-red-300">⚠ OVERDUE</span>
                                          )}
                                        </p>
                                      </div>
                                      <p
                                        className={`font-bold whitespace-nowrap flex-shrink-0 ${
                                          isOverdue
                                            ? "text-red-800 dark:text-red-200 text-sm sm:text-base"
                                            : "text-orange-800 dark:text-orange-200"
                                        }`}
                                      >
                                        {fmtCurrency(calc.myEarnings)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* -- Helpful callout ------------------------------------------------------ */}
      {summary.totalGigs === 0 && (
        <div className="rounded-xl border-2 border-cyan-400 bg-cyan-500/10 p-3 dark:bg-cyan-500/15">
          <p className="text-sm font-medium text-cyan-900 dark:text-cyan-200">
            👋 Ready to add your first performance?
          </p>
          <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-400">
            Click the "Add" button above to get started tracking your gigs and earnings.
          </p>
        </div>
      )}
    </div>
  );
}
