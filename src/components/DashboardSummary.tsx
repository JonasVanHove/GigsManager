"use client";

import { useState } from "react";
import type { DashboardSummary } from "@/types";
import { XAITooltip } from "./XAITooltip";

interface DashboardSummaryProps {
  summary: DashboardSummary;
  fmtCurrency: (amount: number) => string;
}

/**
 * DashboardSummary: Premium summary cards with expandable sections
 *
 * Features:
 * - Split view: Received vs Pending earnings
 * - Expandable cards for mobile (progressive disclosure)
 * - XAI tooltips for explanation
 * - HCI-optimized spacing and hierarchy
 * - Mobile-first responsive design
 */
export function DashboardSummary({ summary, fmtCurrency }: DashboardSummaryProps) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const toggleCard = (cardId: string) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  return (
    <div className="space-y-3">
      {/* ── Row 1: Total Gigs + My Earnings ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Gigs Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Performances
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-cyan-400">
                {summary.totalGigs}
              </p>
            </div>
            <svg className="h-8 w-8 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Total Earnings Card - Expandable */}
        <div className="sm:col-span-3">
          <button
            onClick={() => toggleCard("earnings")}
            className="w-full rounded-xl border-2 border-brand-600 bg-gradient-to-br from-brand-600/10 to-brand-500/5 p-3 shadow-sm transition hover:shadow-lg hover:border-brand-500 dark:border-brand-500 dark:from-brand-500/20 dark:to-brand-600/10 dark:hover:border-brand-400"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  My Earnings
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800 dark:text-brand-300">
                  {fmtCurrency(summary.totalEarnings)}
                </p>
                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">
                  Click to see breakdown →
                </p>
              </div>
              <XAITooltip
                title="My Earnings"
                description="Total money you've earned from all performances based on claims and bonus settings."
                tips={[
                  "Only includes fees & bonuses you claim",
                  "Updates when payment status changes",
                  "Click card to see received vs pending",
                ]}
              >
                <span className="text-brand-600 dark:text-brand-400" />
              </XAITooltip>
            </div>
          </button>

          {/* Expanded earnings breakdown */}
          {expandedCard === "earnings" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border-2 border-lime-500 bg-lime-500/10 p-2.5 dark:border-lime-400 dark:bg-lime-500/20">
                <p className="text-xs font-medium text-lime-700 dark:text-lime-300">
                  ✓ Received
                </p>
                <p className="mt-0.5 font-bold text-lime-800 dark:text-lime-200">
                  {fmtCurrency(summary.totalEarningsReceived)}
                </p>
                <p className="mt-1 text-xs text-lime-600 dark:text-lime-400">
                  From paid gigs
                </p>
              </div>
              <div className="rounded-lg border-2 border-orange-500 bg-orange-500/10 p-2.5 dark:border-orange-400 dark:bg-orange-500/20">
                <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                  ⏳ Pending
                </p>
                <p className="mt-0.5 font-bold text-orange-800 dark:text-orange-200">
                  {fmtCurrency(summary.totalEarningsPending)}
                </p>
                <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                  Awaiting payment
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Pending Payments + Outstanding to Band ────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pending Payments Card */}
        <button
          onClick={() => toggleCard("pending")}
          className="rounded-xl border-2 border-orange-500 bg-orange-500/10 p-3 shadow-sm transition hover:shadow-md hover:border-orange-400 dark:border-orange-400 dark:bg-orange-500/15"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-700 dark:text-orange-300">
                Client Awaiting
              </p>
              <p className="mt-1 text-lg font-bold text-orange-800 dark:text-orange-200">
                {summary.pendingClientPayments}
              </p>
              {expandedCard === "pending" && (
                <p className="mt-1.5 text-xs text-orange-600 dark:text-orange-400">
                  Gigs awaiting payment
                </p>
              )}
            </div>
            <XAITooltip
              title="Pending Client Payments"
              description="Number of performances where you haven't received payment from the client yet."
              tips={[
                "Track follow-ups for unpaid gigs",
                "Mark as paid when money arrives",
              ]}
            >
              <span className="text-orange-700 dark:text-orange-400" />
            </XAITooltip>
          </div>
        </button>

        {/* Outstanding to Band Card */}
        <button
          onClick={() => toggleCard("outstanding")}
          className="rounded-xl border-2 border-pink-500 bg-pink-500/10 p-3 shadow-sm transition hover:shadow-md hover:border-pink-400 dark:border-pink-400 dark:bg-pink-500/15"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-pink-700 dark:text-pink-300">
                Owe to Band
              </p>
              <p className="mt-1 text-lg font-bold text-pink-800 dark:text-pink-200">
                {fmtCurrency(summary.outstandingToBand)}
              </p>
              {expandedCard === "outstanding" && (
                <p className="mt-1.5 text-xs text-pink-600 dark:text-pink-400">
                  From performance splits
                </p>
              )}
            </div>
            <XAITooltip
              title="Outstanding to Band"
              description="Total amount you owe to other musicians based on fee splits and unclaimed fees."
              tips={[
                "Musicians earn their split + fees",
                "Pay out when you receive payment",
                "Track in Band Payments tab",
              ]}
            >
              <span className="text-pink-700 dark:text-pink-400" />
            </XAITooltip>
          </div>
        </button>
      </div>

      {/* ── Helpful callout ────────────────────────────────────────────────────── */}
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
