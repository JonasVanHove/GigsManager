"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicSharedGig, ShareLinkVisibility } from "@/types";
import BandTag from "./BandTag";
import { Icons } from "./Icons";
import { formatDate, resolveLocale, getBandColorStyles } from "@/lib/preferences";

interface SharePayload {
  token: string;
  title: string | null;
  expiresAt: string | null;
  visibility: ShareLinkVisibility;
  passwordRequired: boolean;
  gigs: PublicSharedGig[];
}

interface SharedGigOverviewPageProps {
  token: string;
}

const financialFieldLabels: Array<{
  key: keyof PublicSharedGig;
  label: string;
}> = [
  { key: "performanceFee", label: "Performance Fee" },
  { key: "perMusicianShare", label: "Per Musician" },
  { key: "managerEarnings", label: "Manager Earnings" },
  { key: "managerBonus", label: "Manager Bonus" },
  { key: "technicalFee", label: "Technical Fee" },
  { key: "totalCost", label: "Total Cost" },
];

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function isPastGigDate(value: string | null) {
  if (!value) return false;
  const gigDay = new Date(value);
  const today = new Date();
  gigDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return gigDay < today;
}

/**
 * All-day Google Calendar link for a gig (quick action on the public page).
 * Returns null when the gig has no usable date — never renders a dead button.
 */
function buildGoogleCalendarUrl(gig: PublicSharedGig): string | null {
  if (!gig.gigDate) return null;
  const start = new Date(gig.gigDate);
  if (Number.isNaN(start.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: gig.eventName?.trim() || "Shared performance",
    dates: `${ymd(start)}/${ymd(end)}`,
  });
  if (gig.performers?.trim()) params.set("location", gig.performers.trim());
  if (gig.notes?.trim()) params.set("details", gig.notes.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function QuickActionsRow({
  calendarUrl,
  copied,
  isExpanded,
  onCopy,
  onToggle,
}: {
  calendarUrl: string | null;
  copied: boolean;
  isExpanded: boolean;
  onCopy: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {calendarUrl && (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200 dark:hover:bg-brand-900/40"
        >
          <Icons.Calendar className="h-3.5 w-3.5" /> Add to Calendar
        </a>
      )}
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {copied ? (
          <Icons.Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Icons.Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy details"}
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {isExpanded ? "Hide details" : "View details"}
        <Icons.ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

function GigDetails({
  gig,
  hasFinancialData,
}: {
  gig: PublicSharedGig;
  hasFinancialData: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      {gig.performers && <BandTag name={gig.performers} variant="soft" />}
      {gig.bookingDate && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Icons.Clock className="h-3.5 w-3.5" /> Booked: {formatDate(gig.bookingDate)}
        </p>
      )}
      {gig.notes && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {gig.notes}
        </p>
      )}

      {(gig.clientPaymentStatus || gig.bandPaymentStatus) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {gig.clientPaymentStatus && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                gig.clientPaymentStatus === "received"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }`}
            >
              Client: {gig.clientPaymentStatus === "received" ? "Received" : "Pending"}
            </span>
          )}
          {gig.bandPaymentStatus && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                gig.bandPaymentStatus === "paid"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }`}
            >
              Band: {gig.bandPaymentStatus === "paid" ? "Paid" : "Pending"}
            </span>
          )}
        </div>
      )}

      {hasFinancialData && (
        <div className="mt-2 grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
          {financialFieldLabels.map(({ key: fieldKey, label }) => {
            const value = gig[fieldKey] as number | null;
            if (value === null) return null;
            return (
              <div
                key={fieldKey}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {formatMoney(value)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PreparedGig = {
  gig: PublicSharedGig;
  key: string;
  isPast: boolean;
  bandStyles: ReturnType<typeof getBandColorStyles>;
};

/**
 * One gig card on the public share page: branded accent, status badges,
 * quick actions (calendar / copy summary) and the expanded detail block.
 */
function SharedGigCard({
  item,
  isExpanded,
  onToggle,
  hasFinancialData,
  copied,
  onCopySummary,
}: {
  item: PreparedGig;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  hasFinancialData: boolean;
  copied: boolean;
  onCopySummary: (key: string, gig: PublicSharedGig) => void;
}) {
  const { gig, key, isPast, bandStyles } = item;
  const calendarUrl = buildGoogleCalendarUrl(gig);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-md backdrop-blur transition hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/80 sm:p-5">
      <div
        className="mb-3 border-b border-l-4 pb-3 pl-4"
        style={{ borderLeftColor: bandStyles.solid.backgroundColor }}
      >
        <button
          type="button"
          onClick={() => onToggle(key)}
          aria-expanded={isExpanded}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            {gig.gigDate && (
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {formatDate(gig.gigDate)}
              </p>
            )}
            {gig.eventName && (
              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {gig.eventName}
              </p>
            )}
            {!gig.gigDate && !gig.eventName && (
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Shared performance
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {gig.isCharity && (
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                💕 Charity
              </span>
            )}
            {gig.isTentative && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                ⏳ Tentative
              </span>
            )}
            {isPast ? (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                Past
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Upcoming
              </span>
            )}
          </div>
        </button>
      </div>

      <QuickActionsRow
        calendarUrl={calendarUrl}
        copied={copied}
        isExpanded={isExpanded}
        onCopy={() => onCopySummary(key, gig)}
        onToggle={() => onToggle(key)}
      />

      {isExpanded && (
        <GigDetails gig={gig} hasFinancialData={hasFinancialData} />
      )}
    </article>
  );
}

export default function SharedGigOverviewPage({ token }: SharedGigOverviewPageProps) {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [expired, setExpired] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [shareData, setShareData] = useState<SharePayload | null>(null);
  const [isUpcomingSectionOpen, setIsUpcomingSectionOpen] = useState(true);
  const [isPastSectionOpen, setIsPastSectionOpen] = useState(false);
  const [expandedGigKeys, setExpandedGigKeys] = useState<Set<string>>(new Set());
  const [copiedGigKey, setCopiedGigKey] = useState<string | null>(null);

  const copyGigSummary = async (key: string, gig: PublicSharedGig) => {
    const summary = [
      gig.eventName?.trim() || "Shared performance",
      gig.gigDate ? formatDate(gig.gigDate) : null,
      gig.performers?.trim() || null,
      gig.notes?.trim() || null,
    ].filter((line): line is string => Boolean(line));

    try {
      await navigator.clipboard.writeText(summary.join("\n"));
      setCopiedGigKey(key);
      window.setTimeout(() => {
        setCopiedGigKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Clipboard can be unavailable (insecure context / denied permission).
      // The calendar action and all page content remain usable.
    }
  };

  const loadShareData = useCallback(async () => {
    try {
      setLoading(true);
      setGeneralError("");

      const res = await fetch(`/api/share-links/${token}`, {
        cache: "no-store",
      });

      if (res.status === 410) {
        setExpired(true);
        setShareData(null);
        return;
      }

      if (res.status === 401) {
        const data = await res.json();
        setPasswordRequired(Boolean(data.passwordRequired));
        setShareData(null);
        setExpired(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Unable to load shared gigs");
      }

      const data = (await res.json()) as SharePayload;
      setShareData(data);
      setPasswordRequired(false);
      setExpired(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setGeneralError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadShareData();
  }, [loadShareData]);

  const handleVerifyPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!password.trim()) {
      setPasswordError("Enter the password to continue.");
      return;
    }

    try {
      setVerifying(true);
      setPasswordError("");

      const res = await fetch(`/api/share-links/${token}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 429) {
          const retryAfter = Number(data.retryAfterSeconds || 0);
          setPasswordError(
            retryAfter > 0
              ? `Too many attempts. Retry in ${Math.ceil(retryAfter / 60)} min.`
              : "Too many attempts. Please retry later."
          );
          return;
        }

        setPasswordError(data.error || "Invalid password");
        return;
      }

      setPassword("");
      await loadShareData();
    } catch {
      setPasswordError("Failed to verify password");
    } finally {
      setVerifying(false);
    }
  };

  const hasFinancialData = useMemo(() => {
    if (!shareData) return false;
    return financialFieldLabels.some(({ key }) =>
      shareData.gigs.some((gig) => gig[key] !== null)
    );
  }, [shareData]);

  const preparedGigs = useMemo(() => {
    if (!shareData) return [];
    const sorted = [...shareData.gigs].sort((a, b) => {
      if (!a.gigDate && !b.gigDate) return 0;
      if (!a.gigDate) return 1;
      if (!b.gigDate) return -1;
      return new Date(a.gigDate).getTime() - new Date(b.gigDate).getTime();
    });

    return sorted.map((gig, index) => {
      const key = `${gig.gigDate || "undated"}-${gig.eventName || "event"}-${gig.performers || "performers"}-${index}`;
      const isPast = isPastGigDate(gig.gigDate);
      const bandStyles = getBandColorStyles(gig.performers || "");
      return { gig, key, isPast, bandStyles };
    });
  }, [shareData]);

  const upcomingGigs = useMemo(
    () => preparedGigs.filter((item) => !item.isPast),
    [preparedGigs]
  );

  const pastGigs = useMemo(
    () => preparedGigs.filter((item) => item.isPast),
    [preparedGigs]
  );

  useEffect(() => {
    const defaultExpanded = new Set<string>();
    setExpandedGigKeys(defaultExpanded);
  }, [shareData, upcomingGigs]);

  const expandAll = () => {
    setExpandedGigKeys(new Set(preparedGigs.map((item) => item.key)));
  };

  const collapseAll = () => {
    setExpandedGigKeys(new Set());
  };

  const expandSection = (section: "upcoming" | "past") => {
    const source = section === "upcoming" ? upcomingGigs : pastGigs;
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      source.forEach((item) => next.add(item.key));
      return next;
    });
  };

  const collapseSection = (section: "upcoming" | "past") => {
    const source = section === "upcoming" ? upcomingGigs : pastGigs;
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      source.forEach((item) => next.delete(item.key));
      return next;
    });
  };

  const toggleGig = (key: string) => {
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/70">
          <div className="h-2 bg-gradient-to-r from-brand-600 via-violet-600 to-indigo-700" />
          <div className="p-10 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
              Loading shared gigs…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-amber-300/70 bg-gradient-to-b from-amber-50 to-white p-8 text-center shadow-lg dark:border-amber-700/60 dark:from-amber-950/40 dark:to-slate-900/80">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
            <Icons.AlertTriangle className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-amber-800 dark:text-amber-300">
            This link has expired
          </p>
          <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-400/80">
            Ask whoever shared it with you for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
          <div className="bg-gradient-to-br from-brand-600 via-violet-600 to-indigo-700 px-6 py-5 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <Icons.Lock className="h-5 w-5" />
            </span>
            <h1 className="mt-3 text-lg font-semibold">Protected Share Link</h1>
            <p className="mt-0.5 text-sm text-white/80">
              Enter the password to view this gig overview.
            </p>
          </div>

          <form onSubmit={handleVerifyPassword} className="space-y-3 p-6 pt-5">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="Password"
              autoComplete="current-password"
            />
            {passwordError && (
              <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-70"
            >
              <Icons.Lock className="h-4 w-4" />
              {verifying ? "Verifying…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-red-300/70 bg-gradient-to-b from-red-50 to-white p-8 text-center shadow-lg dark:border-red-700/60 dark:from-red-950/40 dark:to-slate-900/80">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
            <Icons.AlertTriangle className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">
            {generalError || "Unable to load this link."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-brand-800 to-violet-900 p-5 text-white shadow-xl sm:p-8">
        {upcomingGigs[0]?.bandStyles.solid.backgroundColor && (
          <span
            aria-hidden
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl"
            style={{ backgroundColor: upcomingGigs[0].bandStyles.solid.backgroundColor }}
          />
        )}
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <Icons.Link className="h-3.5 w-3.5" /> Shared via GigsManager
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {shareData.title?.trim() || "Shared Gig Overview"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-emerald-200 ring-1 ring-inset ring-emerald-300/40">
              {upcomingGigs.length} upcoming
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-200 ring-1 ring-inset ring-white/20">
              {pastGigs.length} past
            </span>
            {shareData.expiresAt && (
              <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-amber-200 ring-1 ring-inset ring-amber-300/40">
                Expires {formatDate(shareData.expiresAt)}
              </span>
            )}
          </div>
        </div>
      </header>

      {preparedGigs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/75">
          <p className="text-sm text-slate-600 dark:text-slate-400">No gigs are currently shared.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Viewing {preparedGigs.length} shared performance{preparedGigs.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={expandAll}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </div>

          {upcomingGigs.length > 0 && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-700/50 dark:bg-emerald-950/20 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsUpcomingSectionOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-left"
                >
                  <Icons.Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <span className={`text-sm font-semibold text-emerald-800 dark:text-emerald-300 ${isUpcomingSectionOpen ? "" : "opacity-90"}`}>
                    Upcoming Performances
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {upcomingGigs.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => expandSection("upcoming")}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  >
                    Expand section
                  </button>
                  <button
                    type="button"
                    onClick={() => collapseSection("upcoming")}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  >
                    Collapse section
                  </button>
                </div>
              </div>

              {isUpcomingSectionOpen && (
                <div className="space-y-3 sm:space-y-4">
                  {upcomingGigs.map((item) => (
                    <SharedGigCard
                      key={item.key}
                      item={item}
                      isExpanded={expandedGigKeys.has(item.key)}
                      onToggle={toggleGig}
                      hasFinancialData={hasFinancialData}
                      copied={copiedGigKey === item.key}
                      onCopySummary={copyGigSummary}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {pastGigs.length > 0 && (
            <section className="rounded-2xl border border-slate-300 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsPastSectionOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-left"
                >
                  <Icons.Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span className={`text-sm font-semibold text-slate-800 dark:text-slate-200 ${isPastSectionOpen ? "" : "opacity-90"}`}>
                    Past Performances
                  </span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {pastGigs.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => expandSection("past")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Expand section
                  </button>
                  <button
                    type="button"
                    onClick={() => collapseSection("past")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Collapse section
                  </button>
                </div>
              </div>

              {isPastSectionOpen && (
                <div className="space-y-3 sm:space-y-4">
                  {pastGigs.map((item) => (
                    <SharedGigCard
                      key={item.key}
                      item={item}
                      isExpanded={expandedGigKeys.has(item.key)}
                      onToggle={toggleGig}
                      hasFinancialData={hasFinancialData}
                      copied={copiedGigKey === item.key}
                      onCopySummary={copyGigSummary}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
