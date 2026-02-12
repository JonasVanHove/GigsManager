"use client";

import { useState } from "react";
import type { Gig } from "@/types";
import {
  calculateGigFinancials,
  formatDate,
} from "@/lib/calculations";

interface GigCardProps {
  gig: Gig;
  onEdit: (gig: Gig) => void;
  fmtCurrency: (amount: number) => string;
  claimPerformanceFee?: boolean;
  claimTechnicalFee?: boolean;
  isExpandedGlobal?: boolean;
}

export default function GigCard({
  gig,
  onEdit,
  fmtCurrency,
  claimPerformanceFee = true,
  claimTechnicalFee = true,
  isExpandedGlobal,
}: GigCardProps) {
  // Charity gigs start collapsed, others start expanded, but can be overridden by global state
  const [isExpanded, setIsExpanded] = useState(!gig.isCharity);
  
  // Use global expand state if provided, otherwise use local state
  const effectiveIsExpanded = isExpandedGlobal !== undefined ? isExpandedGlobal : isExpanded;

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

  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
      {/* -- Header ------------------------------------------------------ */}
      <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-700/50 dark:bg-slate-800/50">
        {/* Left side: Event info (clickable to expand/collapse) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
        >
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-cyan-300">
              {gig.eventName}
            </h3>
            {gig.isCharity && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-950 px-2 py-0.5 text-xs font-medium text-pink-700 dark:text-pink-300 ring-1 ring-pink-600/20 dark:ring-pink-500/30">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                </svg>
                Charity
              </span>
            )}
            {/* Expand/collapse chevron */}
            <svg
              className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                effectiveIsExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {formatDate(gig.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
              </svg>
              {gig.performers}
            </span>
            <span className="inline-flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              {gig.numberOfMusicians} musician{gig.numberOfMusicians !== 1 ? "s" : ""}
            </span>
          </p>
        </button>

        {/* Actions */}
        <div className="ml-4 flex shrink-0 gap-1">
          <button
            onClick={() => onEdit(gig)}
            title="Edit"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      {effectiveIsExpanded && (
        <>
          {/* -- Financial breakdown ------------------------------------------ */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-4 border-b border-slate-100 dark:border-slate-700/50">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Performance
          </p>
          <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
            {fmtCurrency(gig.performanceFee)}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Technical
          </p>
          <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
            {fmtCurrency(gig.technicalFee)}
          </p>
        </div>

        {gig.managerBonusAmount > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Bonus{" "}
              <span className="normal-case">
                ({gig.managerBonusType === "percentage"
                  ? `${gig.managerBonusAmount}%`
                  : "fixed"})
              </span>
            </p>
            <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
              {fmtCurrency(calc.actualManagerBonus)}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Total Received
          </p>
          <p className="mt-0.5 font-bold text-slate-900 dark:text-white">
            {fmtCurrency(calc.totalReceived)}
          </p>
        </div>
      </div>

      {/* -- Per-person breakdown ----------------------------------------- */}
      <div className="space-y-3 border-t border-slate-100 dark:border-slate-700/50 px-5 py-3">
        {/* Row 1: Per musician + My earnings */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Per Musician
            </p>
            <p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-300">
              {fmtCurrency(calc.amountPerMusician)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-500 dark:text-brand-400">
              My Earnings
            </p>
            <p className="mt-0.5 font-bold text-brand-700 dark:text-brand-300">
              {fmtCurrency(calc.myEarnings)}
            </p>
            {gig.advanceReceivedByManager > 0 && (
              <div className="mt-1.5 space-y-0.5 text-xs">
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Already Received</span>
                  <span className="font-medium">{fmtCurrency(calc.myEarningsAlreadyReceived)}</span>
                </div>
                <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                  <span>Still Owed to Me</span>
                  <span className="font-medium">{fmtCurrency(calc.myEarningsStillOwed)}</span>
                </div>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-500 dark:text-brand-400">
              Total Owed
            </p>
            <p className="mt-0.5 font-semibold text-brand-700 dark:text-brand-300">
              {fmtCurrency(calc.amountOwedToOthers)}
            </p>
          </div>
        </div>

        {/* Row 2: Fee claims + Breakdown of owed */}
        {calc.amountOwedToOthers > 0 && (
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-xs">
            <div>
              <p className="font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Claims{" "}
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  {gig.claimPerformanceFee ? (
                    <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.47 4.47a.75.75 0 0 1 1.06 0L10 8.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L11.06 10l4.47 4.47a.75.75 0 1 1-1.06 1.06L10 11.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L8.94 10 4.47 5.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={gig.claimPerformanceFee ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}>
                    Performance
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {gig.claimTechnicalFee ? (
                    <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.47 4.47a.75.75 0 0 1 1.06 0L10 8.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L11.06 10l4.47 4.47a.75.75 0 1 1-1.06 1.06L10 11.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L8.94 10 4.47 5.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={gig.claimTechnicalFee ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}>
                    Technical
                  </span>
                </div>
              </div>
            </div>

            {gig.managerHandlesDistribution && (
              <div>
                <p className="font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Owed to Band
                </p>
                <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-300">
                  {fmtCurrency(
                    gig.numberOfMusicians > 1
                      ? (gig.numberOfMusicians - 1) * (gig.performanceFee / gig.numberOfMusicians)
                      : 0
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  ({gig.numberOfMusicians - 1} musician{gig.numberOfMusicians > 2 ? "s" : ""})
                </p>
              </div>
            )}

            {!gig.managerHandlesDistribution && (
              <div>
                <p className="font-medium uppercase tracking-wider text-green-600 dark:text-green-400">
                  Band Payment
                </p>
                <p className="mt-1.5 font-semibold text-green-700 dark:text-green-300">
                  Paid directly
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Not your responsibility
                </p>
              </div>
            )}

            {gig.managerHandlesDistribution && !gig.claimTechnicalFee && gig.technicalFee > 0 && (
              <div>
                <p className="font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
                  Owed (Tech)
                </p>
                <p className="mt-1.5 font-semibold text-red-700 dark:text-red-300">
                  {fmtCurrency(gig.technicalFee)}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  (not claimed)
                </p>
              </div>
            )}

            {gig.claimTechnicalFee && gig.technicalFee > 0 && gig.technicalFeeClaimAmount && gig.technicalFeeClaimAmount < gig.technicalFee && (
              <div>
                <p className="font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400">
                  Claimed (Tech)
                </p>
                <p className="mt-1.5 font-semibold text-orange-700 dark:text-orange-300">
                  {fmtCurrency(gig.technicalFeeClaimAmount)}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Owed: {fmtCurrency(gig.technicalFee - gig.technicalFeeClaimAmount)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- Payment status badges ---------------------------------------- */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-700/50 px-5 py-3">
        {/* Context badge when band handles their own payment */}
        {!gig.managerHandlesDistribution && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            Band payment direct
          </span>
        )}

        {/* Client payment status - shown for ALL gigs */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            gig.paymentReceived
              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20 dark:ring-emerald-500/30"
              : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/20 dark:ring-amber-500/30"
          }`}
        >
          {gig.paymentReceived ? (
            <>
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              Client Paid
              {gig.paymentReceivedDate &&
                ` · ${formatDate(gig.paymentReceivedDate)}`}
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                  clipRule="evenodd"
                />
              </svg>
              Awaiting Payment
            </>
          )}
        </span>

        {/* Band payment status - only shown when manager handles distribution */}
        {gig.managerHandlesDistribution && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              gig.bandPaid
                ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20 dark:ring-emerald-500/30"
                : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/20 dark:ring-amber-500/30"
            }`}
          >
            {gig.bandPaid ? (
              <>
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
                Band Paid{gig.bandPaidDate && ` · ${formatDate(gig.bandPaidDate)}`}
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                    clipRule="evenodd"
                  />
                </svg>
                Band Unpaid
              </>
            )}
          </span>
        )}

        {/* Notes badge - shown for all gigs */}
        {gig.notes && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500 dark:text-slate-400"
            title={gig.notes}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            Note
          </span>
        )}
      </div>
        </>
      )}
    </div>
  );
}
