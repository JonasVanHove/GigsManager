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
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Performances
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {summary.totalGigs}
              </p>
            </div>
            <svg className="h-8 w-8 text-gradient-to-r from-brand-400 to-brand-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* Total Earnings Card - Expandable */}
        <div className="sm:col-span-3">
          <button
            onClick={() => toggleCard("earnings")}
            className="w-full rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-100/50 p-3 shadow-sm transition hover:shadow-md dark:border-brand-800/50 dark:from-brand-900/30 dark:to-brand-900/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                  My Earnings
                </p>
                <p className="mt-1 text-xl font-bold text-brand-700 dark:text-brand-300">
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
                <span className="text-brand-600" />
              </XAITooltip>
            </div>
          </button>

          {/* Expanded earnings breakdown */}
          {expandedCard === "earnings" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-green-200 bg-green-50/40 p-2.5 dark:border-green-900/30 dark:bg-green-900/20">
                <p className="text-xs font-medium text-green-700 dark:text-green-400">
                  ✓ Received
                </p>
                <p className="mt-0.5 font-bold text-green-800 dark:text-green-300">
                  {fmtCurrency(summary.totalEarningsReceived)}
                </p>
                <p className="mt-1 text-xs text-green-600 dark:text-green-500">
                  From paid gigs
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 dark:border-amber-900/30 dark:bg-amber-900/20">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  ⏳ Pending
                </p>
                <p className="mt-0.5 font-bold text-amber-800 dark:text-amber-300">
                  {fmtCurrency(summary.totalEarningsPending)}
                </p>
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
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
          className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 shadow-sm transition hover:shadow-md dark:border-amber-900/30 dark:bg-amber-900/20"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Client Awaiting
              </p>
              <p className="mt-1 text-lg font-bold text-amber-800 dark:text-amber-300">
                {summary.pendingClientPayments}
              </p>
              {expandedCard === "pending" && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
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
              <span className="text-amber-700 dark:text-amber-400" />
            </XAITooltip>
          </div>
        </button>

        {/* Outstanding to Band Card */}
        <button
          onClick={() => toggleCard("outstanding")}
          className="rounded-xl border border-purple-200 bg-purple-50/40 p-3 shadow-sm transition hover:shadow-md dark:border-purple-900/30 dark:bg-purple-900/20"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-purple-700 dark:text-purple-400">
                Owe to Band
              </p>
              <p className="mt-1 text-lg font-bold text-purple-800 dark:text-purple-300">
                {fmtCurrency(summary.outstandingToBand)}
              </p>
              {expandedCard === "outstanding" && (
                <p className="mt-1.5 text-xs text-purple-600 dark:text-purple-500">
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
              <span className="text-purple-700 dark:text-purple-400" />
            </XAITooltip>
          </div>
        </button>
      </div>

      {/* ── Helpful callout ────────────────────────────────────────────────────── */}
      {summary.totalGigs === 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/30 dark:bg-blue-900/20">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
            👋 Ready to add your first performance?
          </p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
            Click the "Add" button above to get started tracking your gigs and earnings.
          </p>
        </div>
      )}
    </div>
  );
}
