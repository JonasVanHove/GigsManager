"use client";

import type { Gig } from "@/types";
import {
  calculateGigFinancials,
  formatDate,
} from "@/lib/calculations";

interface GigCardProps {
  gig: Gig;
  onEdit: (gig: Gig) => void;
  onDelete: (gig: Gig) => void;
  fmtCurrency: (amount: number) => string;
  claimPerformanceFee?: boolean;
  claimTechnicalFee?: boolean;
}

export default function GigCard({
  gig,
  onEdit,
  onDelete,
  fmtCurrency,
  claimPerformanceFee = true,
  claimTechnicalFee = true,
}: GigCardProps) {
  const calc = calculateGigFinancials(
    gig.performanceFee,
    gig.technicalFee,
    gig.managerBonusType,
    gig.managerBonusAmount,
    gig.numberOfMusicians,
    claimPerformanceFee,
    claimTechnicalFee
  );

  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-slate-900">
            {gig.eventName}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
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
        </div>

        {/* Actions */}
        <div className="ml-4 flex shrink-0 gap-1">
          <button
            onClick={() => onEdit(gig)}
            title="Edit"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(gig)}
            title="Delete"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Financial breakdown ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Performance
          </p>
          <p className="mt-0.5 font-semibold text-slate-800">
            {fmtCurrency(gig.performanceFee)}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Technical
          </p>
          <p className="mt-0.5 font-semibold text-slate-800">
            {fmtCurrency(gig.technicalFee)}
          </p>
        </div>

        {gig.managerBonusAmount > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Bonus{" "}
              <span className="normal-case">
                ({gig.managerBonusType === "percentage"
                  ? `${gig.managerBonusAmount}%`
                  : "fixed"})
              </span>
            </p>
            <p className="mt-0.5 font-semibold text-slate-800">
              {fmtCurrency(calc.actualManagerBonus)}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total Received
          </p>
          <p className="mt-0.5 font-bold text-slate-900">
            {fmtCurrency(calc.totalReceived)}
          </p>
        </div>
      </div>

      {/* ── Per-person breakdown ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Per Musician
          </p>
          <p className="mt-0.5 font-semibold text-slate-700">
            {fmtCurrency(calc.amountPerMusician)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-500">
            My Earnings
          </p>
          <p className="mt-0.5 font-bold text-brand-700">
            {fmtCurrency(calc.myEarnings)}
          </p>
        </div>
        {calc.amountOwedToOthers > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-amber-500">
              Owe to Others
            </p>
            <p className="mt-0.5 font-semibold text-amber-700">
              {fmtCurrency(calc.amountOwedToOthers)}
            </p>
          </div>
        )}
      </div>

      {/* ── Payment status badges ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            gig.paymentReceived
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
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

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            gig.bandPaid
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
              : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
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

        {gig.notes && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500"
            title={gig.notes}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            Note
          </span>
        )}
      </div>
    </div>
  );
}
