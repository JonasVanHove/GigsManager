"use client";

import { memo, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Gig } from "@/types";
import {
  calculateGigFinancials,
  formatDate,
} from "@/lib/calculations";
import { getBandColorStyles } from "@/lib/preferences";
import { getLocalNotes } from "@/lib/notes-store";
import BandTag from "./BandTag";
import GigQuickNotesModal from "./GigQuickNotesModal";
import { Icons } from "./Icons";
import { useSettings } from "./SettingsProvider";

function isPastGigDate(value: string) {
  const gigDay = new Date(value);
  if (Number.isNaN(gigDay.getTime())) return false;

  const today = new Date();
  gigDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return gigDay < today;
}

interface GigCardProps {
  gig: Gig;
  onEdit: (gig: Gig) => void;
  fmtCurrency: (amount: number) => string;
  claimPerformanceFee?: boolean;
  claimTechnicalFee?: boolean;
  isExpandedGlobal?: boolean;
  isSelected?: boolean;
  onSelect?: (gigId: string) => void;
  onRequestLocalToggle?: () => void;
  onDelete?: (gig: Gig) => void;
  onDuplicate?: (gig: Gig) => void;
}

const GigCard = memo(function GigCard({
  gig,
  onEdit,
  fmtCurrency,
  claimPerformanceFee = true,
  claimTechnicalFee = true,
  isExpandedGlobal,
  isSelected = false,
  onSelect,
  onRequestLocalToggle,
  onDelete,
  onDuplicate,
}: GigCardProps) {
  const router = useRouter();
  // Charity gigs start collapsed, others start expanded, but can be overridden by global state
  const [isExpanded, setIsExpanded] = useState(!gig.isCharity);
  const [hasPendingNotes, setHasPendingNotes] = useState(false);
  // Local overlay so the card reflects a note saved in the drawer without
  // waiting for a full list refetch.
  const [localNotes, setLocalNotes] = useState<string | null>(gig.notes);
  const [showQuickNotes, setShowQuickNotes] = useState(false);
  const { locale } = useSettings();
  const isDutch = locale.startsWith("nl");
  
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rec = await getLocalNotes(gig.id);
        if (!mounted) return;
        setHasPendingNotes(rec !== null && !rec.syncedAt);
      } catch (e) {
        console.debug("Failed to check notes status", e);
      }
    })();
    return () => { mounted = false; };
  }, [gig.id]);
  
  // Use global expand state if provided, otherwise use local state
  const effectiveIsExpanded = isExpandedGlobal !== undefined ? isExpandedGlobal : isExpanded;
  const isClientPaymentOverdue = useMemo(
    () => !gig.paymentReceived && isPastGigDate(gig.date),
    [gig.date, gig.paymentReceived]
  );

  const calc = useMemo(
    () =>
      calculateGigFinancials(
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
      ),
    [
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
      gig.isCharity,
    ]
  );

  const formattedDate = useMemo(() => formatDate(gig.date), [gig.date]);
  const bandStyles = useMemo(() => getBandColorStyles(gig.performers, gig.band?.color), [gig.performers, gig.band?.color]);

  return (
    <div className={`group w-full max-w-full overflow-hidden rounded-xl border border-l-4 animate-fade-in transition-all duration-300 ${
      gig.managerInstantPayment
        ? 'surface-card border-slate-300/80 bg-slate-100/60 backdrop-blur dark:border-slate-600/60 dark:bg-slate-800/50 dark:backdrop-blur'
        : isSelected
        ? 'border-blue-400/60 bg-blue-50/60 backdrop-blur shadow-lg dark:bg-blue-950/30 dark:border-blue-400/60 dark:backdrop-blur'
        : isClientPaymentOverdue
          ? 'border-red-300/80 bg-red-50/50 backdrop-blur shadow-md dark:border-red-500/40 dark:bg-red-950/20 dark:shadow-lg dark:backdrop-blur'
          : gig.band?.color
          ? `surface-card surface-card-hover backdrop-blur ${bandStyles.soft.backgroundColor} dark:backdrop-blur`
          : 'surface-card surface-card-hover backdrop-blur dark:bg-slate-900/50 dark:backdrop-blur'
    }`} style={{
      borderLeftColor: bandStyles.solid.backgroundColor,
      borderColor: gig.band?.color ? bandStyles.soft.borderColor : undefined
    }}>
      {/* -- Header ------------------------------------------------------ */}
      <div className={`flex min-w-0 items-start justify-between divider-subtle border-b transition-colors px-3 py-3 sm:px-5 sm:py-4`}>
        {/* Left side: Checkbox + Event info (clickable to expand/collapse) */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {onSelect && (
            <button
              onClick={() => onSelect(gig.id)}
              className="mt-1 shrink-0 rounded transition hover:bg-slate-200 dark:hover:bg-slate-600 p-0.5"
              title="Select this gig for bulk actions"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="h-5 w-5 rounded border-slate-300 text-blue-600 transition focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
              />
            </button>
          )}
          <button
            onClick={() => {
              // If a global expand/collapse state is active, clear it so this card can use local state
              if (isExpandedGlobal !== undefined) {
                onRequestLocalToggle?.();
              }
              setIsExpanded(!isExpanded);
            }}
            className="min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
          >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 max-w-full break-words text-lg font-semibold text-slate-900 dark:text-cyan-300 sm:truncate">
              {gig.eventName}
            </h3>
            {gig.isCharity && (
              <>
                <span className="inline-flex tablet:hidden items-center shrink-0 p-1 rounded-md text-pink-600 dark:text-pink-300 badge-enter" title="Charity">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                  </svg>
                </span>
                <span className="badge badge-charity badge-enter hidden tablet:inline-flex shrink-0">
                  <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
                  </svg>
                  💕 Charity
                </span>
              </>
            )}
            {gig.isTentative && (
              <>
                <span className="inline-flex tablet:hidden items-center shrink-0 p-1 rounded-md text-amber-700 dark:text-amber-300 badge-enter" title="Tentative">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v5l3 2" />
                  </svg>
                </span>
                <span className="badge badge-option badge-enter hidden tablet:inline-flex shrink-0">
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v5l3 2" />
                  </svg>
                  ⏳ Tentative
                </span>
              </>
            )}
            {hasPendingNotes && (
              <span className="badge badge-accent badge-enter shrink-0">
                <Icons.Spinner className="h-3 w-3 shrink-0 animate-pulse" />
                {isDutch ? "Notities (pending)" : "Notes (pending)"}
              </span>
            )}
            {gig.managerInstantPayment && (
              <>
                <span className="inline-flex tablet:hidden items-center shrink-0 p-1 rounded-md text-amber-700 dark:text-amber-300 badge-enter" title="Manager pays">
                  <Icons.Wallet className="h-4 w-4" />
                </span>
                <span className="badge badge-pending badge-enter hidden tablet:inline-flex shrink-0">
                  <Icons.Wallet className="h-3 w-3 shrink-0" />
                  💰 Manager pays — arrange payment
                </span>
              </>
            )}
            {/* Expand/collapse chevron */}
            <Icons.ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${
                effectiveIsExpanded ? "rotate-180" : ""
              }`}
            />
          </div>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs tablet:text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Icons.Calendar className="h-4 w-4 shrink-0" />
              <span className="hidden tablet:inline">{formattedDate}</span>
              <span className="tablet:hidden">{formattedDate}</span>
            </span>
            <BandTag name={gig.performers} variant={gig.band?.color ? "solid" : "soft"} color={gig.band?.color} />
            <span className="hidden tablet:inline-flex items-center gap-1">
              <Icons.People className="h-4 w-4 shrink-0" />
              {gig.numberOfMusicians} musician{gig.numberOfMusicians !== 1 ? "s" : ""}
            </span>
          </p>
          </button>
        </div>

        {/* Actions */}
        <div className="ml-4 flex shrink-0 items-center gap-1">
          {gig.setlistId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/app?tab=setlists&setlist=${gig.setlistId}`);
              }}
              title={isDutch ? "Bekijk setlist" : "View setlist"}
              className="rounded-lg p-2 text-cyan-600 transition-all duration-200 hover:bg-cyan-100/60 dark:hover:bg-cyan-900/30 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              <Icons.ListView className="h-4 w-4 shrink-0" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(gig);
              }}
              title={isDutch ? "Dupliceer optreden" : "Duplicate gig"}
              className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-700/50 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Icons.Copy className="h-4 w-4 shrink-0" />
            </button>
          )}
          <button
            onClick={() => onEdit(gig)}
            title={isDutch ? "Bewerken" : "Edit"}
            aria-label={isDutch ? `Bewerken: ${gig.eventName}` : `Edit: ${gig.eventName}`}
            data-testid="edit-performance-button"
            className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:bg-brand-100/60 hover:text-brand-600 dark:hover:bg-brand-900/30 dark:text-slate-300 dark:hover:text-brand-300"
          >
            <Icons.Edit className="h-4 w-4 shrink-0" />
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(gig);
              }}
              title={isDutch ? "Verwijderen" : "Delete"}
              className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:bg-red-100/60 hover:text-red-600 dark:hover:bg-red-900/30 dark:text-slate-400 dark:hover:text-red-400"
            >
              <Icons.Trash className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* -- Quick notes & AI summary --------------------------------------
          Its own row rather than another icon in the actions cluster: the
          label is what makes it findable on a phone, and it stays reachable
          whether or not the card is expanded. */}
      <div className="px-4 pb-3.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowQuickNotes(true);
          }}
          title={isDutch ? "Notities & stand van zaken" : "Notes & AI summary"}
          aria-label={
            isDutch
              ? `Notities & stand van zaken: ${gig.eventName}`
              : `Notes & AI summary: ${gig.eventName}`
          }
          data-testid="gig-quick-notes-button"
          className="touch-target flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100/70 dark:border-brand-800/70 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:bg-brand-900/40"
        >
          <Icons.Sparkles className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {isDutch ? "Notities & stand van zaken" : "Notes & AI summary"}
          </span>
        </button>
      </div>

      {/* Collapsible content */}
      {effectiveIsExpanded && (
        <div className="animate-expand">
          {/* -- Financial breakdown ------------------------------------------ */}
          <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 px-3 py-4 text-sm sm:grid-cols-4 sm:px-5 border-b border-slate-100 dark:border-slate-700/50 animate-fade-in">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Performance
          </p>
          <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
            {gig.performanceFeeUnknown ? "Unknown" : fmtCurrency(gig.performanceFee)}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Technical
          </p>
          <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
            {fmtCurrency(gig.technicalFee)}
          </p>
        </div>

        {gig.managerBonusAmount > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
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
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
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
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
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
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3 text-xs sm:grid-cols-3">
            <div>
              <p className="font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Claims{" "}
              </p>
              <div className="mt-1.5 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  {gig.claimPerformanceFee ? (
                    <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.47 4.47a.75.75 0 0 1 1.06 0L10 8.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L11.06 10l4.47 4.47a.75.75 0 1 1-1.06 1.06L10 11.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L8.94 10 4.47 5.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={gig.claimPerformanceFee ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}>
                    Performance
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {gig.claimTechnicalFee ? (
                    <Icons.Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Icons.Close className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  )}
                  <span className={gig.claimTechnicalFee ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}>
                    Technical
                  </span>
                </div>
              </div>
            </div>

            {gig.managerHandlesDistribution && (
              <div>
                <p className={`font-medium uppercase tracking-wider ${
                  gig.bandPaid
                    ? "text-green-600 dark:text-green-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}>
                  {gig.bandPaid ? "✅ Band Paid" : "Owed to Band"}
                </p>
                <p className={`mt-1.5 font-semibold ${
                  gig.bandPaid
                    ? "text-green-700 dark:text-green-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}>
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
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 badge-enter">
            👥 Band payment direct
          </span>
        )}

        {/* Client payment status - shown for ALL gigs */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium badge-enter ${
            gig.paymentReceived
              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20 dark:ring-emerald-500/30"
              : isClientPaymentOverdue
                ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 ring-1 ring-red-600/20 dark:ring-red-500/30"
                : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/20 dark:ring-amber-500/30"
          }`}
        >
          {gig.paymentReceived ? (
            <>
              ✅ Client Paid
              {gig.paymentReceivedDate &&
                ` · ${formatDate(gig.paymentReceivedDate)}`}
            </>
          ) : (
            <>
              <Icons.AlertCircle className="h-3 w-3 shrink-0" />
              {isClientPaymentOverdue ? "⚠️ Payment overdue" : "⏳ Awaiting Payment"}
            </>
          )}
        </span>

        {/* Band payment status - only shown when manager handles distribution */}
        {gig.managerHandlesDistribution && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium badge-enter ${
              gig.bandPaid
                ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20 dark:ring-emerald-500/30"
                : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/20 dark:ring-amber-500/30"
            }`}
          >
            {gig.bandPaid ? (
              <>
                ✅ Band Paid{gig.bandPaidDate && ` · ${formatDate(gig.bandPaidDate)}`}
              </>
            ) : (
              <>
                <Icons.AlertCircle className="h-3 w-3 shrink-0" />
                🎵 Band Unpaid
              </>
            )}
          </span>
        )}

        {/* Notes badge - shown for all gigs */}
        {localNotes && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500 dark:text-slate-400"
            title={localNotes}
          >
            <Icons.Document className="h-3 w-3 shrink-0" />
            Note
          </span>
        )}
      </div>
        </div>
      )}

      {showQuickNotes && (
        <GigQuickNotesModal
          gig={{ ...gig, notes: localNotes }}
          isDutch={isDutch}
          onNotesSaved={setLocalNotes}
          onClose={() => setShowQuickNotes(false)}
        />
      )}
    </div>
  );
});

export default GigCard;
