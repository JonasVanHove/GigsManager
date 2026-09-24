"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicSharedGig, ShareLinkVisibility } from "@/types";
import { formatDate, getBandColorStyles, resolveLocale } from "@/lib/preferences";
import BandTag from "./BandTag";
import { Icons } from "./Icons";

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
  { key: "performanceFee", label: "Performance fee" },
  { key: "perMusicianShare", label: "Per musician" },
  { key: "managerEarnings", label: "Manager earnings" },
  { key: "managerBonus", label: "Manager bonus" },
  { key: "technicalFee", label: "Technical fee" },
  { key: "totalCost", label: "Total cost" },
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

function parseGigDate(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3])
    );
  }
  return new Date(value);
}

function startOfLocalDay(value: Date) {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getGigDayDifference(value: string | null) {
  if (!value) return null;
  const gigDay = parseGigDate(value);
  if (Number.isNaN(gigDay.getTime())) return null;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfLocalDay(gigDay).getTime() - startOfLocalDay(new Date()).getTime()) /
      millisecondsPerDay
  );
}

function isPastGigDate(value: string | null) {
  const dayDifference = getGigDayDifference(value);
  return dayDifference !== null && dayDifference < 0;
}

function getCountdownLabel(value: string | null) {
  const days = getGigDayDifference(value);
  if (days === null) return null;
  if (days < 0) return "Past performance";
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

function buildGoogleCalendarUrl(gig: PublicSharedGig): string | null {
  if (!gig.gigDate) return null;
  const start = parseGigDate(gig.gigDate);
  if (Number.isNaN(start.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  const ymd = (date: Date) =>
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
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

function BrandBadge() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/15 shadow-lg shadow-black/20 backdrop-blur-xl sm:h-14 sm:w-14">
        <Image
          src="/favicon.png"
          alt="GigsManager"
          width={56}
          height={56}
          priority
          className="h-10 w-10 object-contain sm:h-12 sm:w-12"
        />
        <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />
      </div>
      <div>
        <p className="text-sm font-black tracking-[0.2em] text-white sm:text-base">
          GIGSMANAGER
        </p>
        <p className="mt-0.5 text-xs font-medium text-slate-300">Private performance view</p>
      </div>
    </div>
  );
}

function QuickActionsRow({
  calendarUrl,
  copied,
  isExpanded,
  onCopy,
  onToggle,
  compact = false,
}: {
  calendarUrl: string | null;
  copied: boolean;
  isExpanded: boolean;
  onCopy: () => void;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {calendarUrl ? (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-800 transition hover:-translate-y-0.5 hover:bg-brand-100 hover:shadow-sm dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/50"
        >
          <Icons.Calendar className="h-3.5 w-3.5" /> Add to Calendar
        </a>
      ) : (
        <button
          type="button"
          disabled
          title="Add a shared gig date to enable calendar export"
          className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
        >
          <Icons.Calendar className="h-3.5 w-3.5" /> Add to Calendar
        </button>
      )}
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {copied ? (
          <Icons.Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Icons.Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Details copied" : "Copy Details"}
      </button>
      {!compact && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {isExpanded ? "Hide details" : "View details"}
          <Icons.ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

function PaymentBadges({ gig }: { gig: PublicSharedGig }) {
  if (!gig.clientPaymentStatus && !gig.bandPaymentStatus) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {gig.clientPaymentStatus && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            gig.clientPaymentStatus === "received"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          }`}
        >
          <Icons.Wallet className="h-3 w-3" />
          Client {gig.clientPaymentStatus === "received" ? "paid" : "pending"}
        </span>
      )}
      {gig.bandPaymentStatus && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            gig.bandPaymentStatus === "paid"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          }`}
        >
          <Icons.People className="h-3 w-3" />
          Band {gig.bandPaymentStatus === "paid" ? "paid" : "pending"}
        </span>
      )}
    </div>
  );
}

function FeeBadges({ gig }: { gig: PublicSharedGig }) {
  const visibleFees = financialFieldLabels
    .map(({ key, label }) => ({
      label,
      value: formatMoney(gig[key] as number | null),
    }))
    .filter((item): item is { label: string; value: string } => item.value !== null);

  if (visibleFees.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleFees.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Icons.Wallet className="h-3 w-3" />
          {item.label}: {item.value}
        </span>
      ))}
    </div>
  );
}

type PreparedGig = {
  gig: PublicSharedGig;
  key: string;
  isPast: boolean;
  bandStyles: ReturnType<typeof getBandColorStyles>;
};

function GigDetails({ gig }: { gig: PublicSharedGig }) {
  const visibleFinancials = financialFieldLabels
    .map(({ key, label }) => ({
      label,
      value: formatMoney(gig[key] as number | null),
    }))
    .filter((item): item is { label: string; value: string } => item.value !== null);

  return (
    <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:grid-cols-2">
      {gig.bookingDate && (
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
          <Icons.Calendar className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Booked
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatDate(gig.bookingDate)}
            </p>
          </div>
        </div>
      )}
      {gig.notes && (
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70 sm:col-span-2">
          <Icons.Document className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
              {gig.notes}
            </p>
          </div>
        </div>
      )}
      {visibleFinancials.length > 0 && (
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
          {visibleFinancials.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/60"
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {item.label}
              </p>
              <p className="mt-1 font-bold text-slate-900 dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadges({ item }: { item: PreparedGig }) {
  const { gig, isPast } = item;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {isPast ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
          <Icons.Clock className="h-3 w-3" /> Past
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
          <Icons.CheckCircle className="h-3 w-3" /> Upcoming
        </span>
      )}
      {gig.isCharity && (
        <span className="rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold text-pink-700 dark:bg-pink-950/60 dark:text-pink-300">
          Charity
        </span>
      )}
      {gig.isTentative && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          Tentative
        </span>
      )}
    </div>
  );
}

function SharedGigCard({
  item,
  isExpanded,
  onToggle,
  copied,
  onCopySummary,
}: {
  item: PreparedGig;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  copied: boolean;
  onCopySummary: (key: string, gig: PublicSharedGig) => void;
}) {
  const { gig, key, bandStyles } = item;
  const calendarUrl = buildGoogleCalendarUrl(gig);
  const dayDifference = getGigDayDifference(gig.gigDate);
  const eventTitle = gig.eventName?.trim() || "Shared performance";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl dark:border-slate-700/80 dark:bg-slate-900/85 dark:hover:border-slate-600">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: bandStyles.solid.backgroundColor }}
      />
      <div className="p-4 sm:p-5 sm:pl-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {gig.gigDate && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  <Icons.Calendar className="h-3.5 w-3.5" /> {formatDate(gig.gigDate)}
                </span>
              )}
              {gig.performers && <BandTag name={gig.performers} variant="soft" />}
            </div>
            <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl">
              {eventTitle}
            </h3>
            {gig.performers && (
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {gig.performers}
              </p>
            )}
          </div>
          <StatusBadges item={item} />
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          {gig.gigDate && (
            <p className="flex items-center gap-2">
              <Icons.Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {dayDifference === 0
                  ? "Scheduled for today"
                  : dayDifference !== null && dayDifference > 0
                    ? `In ${dayDifference} ${dayDifference === 1 ? "day" : "days"}`
                    : formatDate(gig.gigDate)}
              </span>
            </p>
          )}
          {gig.performers && (
            <p className="flex min-w-0 items-center gap-2">
              <Icons.MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">Venue / performers: {gig.performers}</span>
            </p>
          )}
          {gig.notes && (
            <p className="flex min-w-0 items-center gap-2 sm:col-span-2">
              <Icons.Document className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{gig.notes}</span>
            </p>
          )}
        </div>

        {(financialFieldLabels.some(({ key }) => gig[key] !== null) ||
          gig.clientPaymentStatus ||
          gig.bandPaymentStatus) && (
          <div className="mt-4 space-y-2">
            <FeeBadges gig={gig} />
            <PaymentBadges gig={gig} />
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <QuickActionsRow
            calendarUrl={calendarUrl}
            copied={copied}
            isExpanded={isExpanded}
            onCopy={() => onCopySummary(key, gig)}
            onToggle={() => onToggle(key)}
          />
        </div>

        {isExpanded && <GigDetails gig={gig} />}
      </div>
    </article>
  );
}

function NextGigSpotlight({
  item,
  copied,
  onCopy,
}: {
  item: PreparedGig | undefined;
  copied: boolean;
  onCopy: (key: string, gig: PublicSharedGig) => void;
}) {
  if (!item) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900/85 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <Icons.Clock className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Next gig spotlight
            </p>
            <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">
              Nothing on the calendar yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              No upcoming shared gigs are available in this link.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { gig, key, bandStyles } = item;
  const countdown = getCountdownLabel(gig.gigDate);
  const calendarUrl = buildGoogleCalendarUrl(gig);
  const eventTitle = gig.eventName?.trim() || "Shared performance";

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/25 sm:p-8"
      style={{
        backgroundImage: `radial-gradient(circle at 88% 12%, ${bandStyles.solid.backgroundColor} 0%, transparent 34%), linear-gradient(135deg, #07111f 0%, #111827 52%, #172033 100%)`,
      }}
    >
      <div aria-hidden className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-brand-200">
            <Icons.Sparkles className="h-4 w-4" /> Next gig spotlight
          </p>
          {countdown && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black text-white backdrop-blur-xl">
              <Icons.Clock className="h-3.5 w-3.5 text-brand-200" /> {countdown}
            </span>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-bold text-slate-300">
              {gig.performers?.trim() || "Band details not shared"}
            </p>
            <h2 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              {eventTitle}
            </h2>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-200">
              {gig.gigDate && (
                <span className="inline-flex items-center gap-2">
                  <Icons.Calendar className="h-4 w-4 text-brand-300" />
                  {formatDate(gig.gigDate)}
                </span>
              )}
              {gig.performers && (
                <span className="inline-flex items-center gap-2">
                  <Icons.MapPin className="h-4 w-4 text-brand-300" />
                  Venue / performers: {gig.performers}
                </span>
              )}
              {gig.notes && (
                <span className="inline-flex max-w-lg items-center gap-2">
                  <Icons.Document className="h-4 w-4 shrink-0 text-brand-300" />
                  <span className="truncate">{gig.notes}</span>
                </span>
              )}
            </div>
          </div>

          <QuickActionsRow
            calendarUrl={calendarUrl}
            copied={copied}
            isExpanded={false}
            onCopy={() => onCopy(key, gig)}
            onToggle={() => undefined}
            compact
          />
        </div>
      </div>
    </section>
  );
}

function PerformanceMetrics({
  total,
  upcoming,
  past,
  bandBreakdown,
}: {
  total: number;
  upcoming: number;
  past: number;
  bandBreakdown: Array<{ name: string; count: number }>;
}) {
  const metrics = [
    { label: "Total shared gigs", value: total, icon: Icons.Link },
    { label: "Upcoming", value: upcoming, icon: Icons.Calendar },
    { label: "Past", value: past, icon: Icons.Clock },
  ];

  return (
    <section
      aria-label="Shared performance metrics"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-lg backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/80"
    >
      <div className="grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-700">
        {metrics.map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <div key={metric.label} className="flex items-center gap-4 p-4 sm:p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                <MetricIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  {metric.value}
                </p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {metric.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40 sm:px-5">
        <span className="mr-1 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Bands
        </span>
        {bandBreakdown.length > 0 ? (
          bandBreakdown.map((band) => (
            <span
              key={band.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {band.name}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {band.count}
              </span>
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">No band names shared</span>
        )}
      </div>
    </section>
  );
}

function CalendarTimeline({
  items,
  expandedGigKeys,
  copiedGigKey,
  onToggleGig,
  onCopySummary,
  onExpandAll,
  onCollapseAll,
}: {
  items: PreparedGig[];
  expandedGigKeys: Set<string>;
  copiedGigKey: string | null;
  onToggleGig: (key: string) => void;
  onCopySummary: (key: string, gig: PublicSharedGig) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <section aria-labelledby="calendar-timeline-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">
            Schedule
          </p>
          <h2
            id="calendar-timeline-title"
            className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl"
          >
            Calendar timeline
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Every shared booking, from the next stage call to past performances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExpandAll}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Icons.Expand className="h-3.5 w-3.5" /> Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Icons.ChevronUp className="h-3.5 w-3.5" /> Collapse all
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <Icons.Calendar className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            No gigs are currently shared.
          </p>
        </div>
      ) : (
        <div className="relative ml-3 border-l-2 border-slate-200 pl-5 dark:border-slate-700 sm:ml-4 sm:pl-7">
          {items.map((item) => (
            <div key={item.key} className="relative pb-5 last:pb-0">
              <span
                aria-hidden
                className={`absolute -left-[1.6875rem] top-6 h-3.5 w-3.5 rounded-full border-[3px] border-slate-100 shadow-sm sm:-left-[2.1875rem] dark:border-slate-900 ${
                  item.isPast ? "bg-slate-400" : "bg-brand-500"
                }`}
              />
              <SharedGigCard
                item={item}
                isExpanded={expandedGigKeys.has(item.key)}
                onToggle={onToggleGig}
                copied={copiedGigKey === item.key}
                onCopySummary={onCopySummary}
              />
            </div>
          ))}
        </div>
      )}
    </section>
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
  const [expandedGigKeys, setExpandedGigKeys] = useState<Set<string>>(new Set());
  const [copiedGigKey, setCopiedGigKey] = useState<string | null>(null);

  const copyGigSummary = useCallback(async (key: string, gig: PublicSharedGig) => {
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
        setCopiedGigKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      // Clipboard access can be blocked in an insecure context; page content stays usable.
    }
  }, []);

  const loadShareData = useCallback(async () => {
    try {
      setLoading(true);
      setGeneralError("");

      const response = await fetch(`/api/share-links/${token}`, { cache: "no-store" });

      if (response.status === 410) {
        setExpired(true);
        setShareData(null);
        return;
      }

      if (response.status === 401) {
        const data = await response.json();
        setPasswordRequired(Boolean(data.passwordRequired));
        setShareData(null);
        setExpired(false);
        return;
      }

      if (!response.ok) throw new Error("Unable to load shared gigs");

      const data = (await response.json()) as SharePayload;
      setShareData(data);
      setPasswordRequired(false);
      setExpired(false);
      setExpandedGigKeys(new Set());
    } catch (error) {
      setGeneralError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadShareData();
  }, [loadShareData]);

  const handleVerifyPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      setPasswordError("Enter the password to continue.");
      return;
    }

    try {
      setVerifying(true);
      setPasswordError("");
      const response = await fetch(`/api/share-links/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 429) {
          const retryAfter = Number(data.retryAfterSeconds || 0);
          setPasswordError(
            retryAfter > 0
              ? `Too many attempts. Retry in ${Math.ceil(retryAfter / 60)} min.`
              : "Too many attempts. Please retry later."
          );
        } else {
          setPasswordError(data.error || "Invalid password");
        }
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

  const preparedGigs = useMemo(() => {
    if (!shareData) return [];
    return [...shareData.gigs]
      .sort((first, second) => {
        if (!first.gigDate && !second.gigDate) return 0;
        if (!first.gigDate) return 1;
        if (!second.gigDate) return -1;
        return new Date(first.gigDate).getTime() - new Date(second.gigDate).getTime();
      })
      .map((gig, index) => ({
        gig,
        key: `${gig.gigDate || "undated"}-${gig.eventName || "event"}-${gig.performers || "performers"}-${index}`,
        isPast: isPastGigDate(gig.gigDate),
        bandStyles: getBandColorStyles(gig.performers || ""),
      }));
  }, [shareData]);

  const upcomingGigs = useMemo(
    () => preparedGigs.filter((item) => !item.isPast),
    [preparedGigs]
  );
  const pastGigs = useMemo(
    () => preparedGigs.filter((item) => item.isPast).reverse(),
    [preparedGigs]
  );
  const timelineGigs = useMemo(
    () => [...upcomingGigs, ...pastGigs],
    [upcomingGigs, pastGigs]
  );
  const bandBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    preparedGigs.forEach(({ gig }) => {
      const name = gig.performers?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count })).sort(
      (first, second) => second.count - first.count || first.name.localeCompare(second.name)
    );
  }, [preparedGigs]);

  const expandAll = useCallback(() => {
    setExpandedGigKeys(new Set(preparedGigs.map((item) => item.key)));
  }, [preparedGigs]);

  const collapseAll = useCallback(() => {
    setExpandedGigKeys(new Set());
  }, []);

  const toggleGig = useCallback((key: string) => {
    setExpandedGigKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 p-8 text-center text-white shadow-2xl">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-white/20 border-t-brand-300" />
          <p className="mt-5 text-sm font-bold text-slate-200">Loading shared gigs…</p>
        </div>
      </main>
    );
  }

  if (expired) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg rounded-3xl border border-amber-300/50 bg-amber-50 p-8 text-center shadow-xl dark:border-amber-700/50 dark:bg-amber-950/30">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300">
            <Icons.Clock className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-2xl font-black text-amber-950 dark:text-amber-200">
            This link has expired
          </h1>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300/80">
            Ask whoever shared it with you for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  if (passwordRequired) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
          <div className="bg-gradient-to-br from-brand-700 via-slate-900 to-violet-950 p-6 text-white">
            <BrandBadge />
            <div className="mt-7 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur">
                <Icons.Lock className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-black">Passcode protected</h1>
                <p className="mt-0.5 text-sm text-slate-300">Enter the passcode to view these gigs.</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleVerifyPassword} className="space-y-3 bg-white p-6 dark:bg-slate-900">
            <label htmlFor="share-passcode" className="sr-only">Share passcode</label>
            <input
              id="share-passcode"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="Passcode"
              autoComplete="current-password"
            />
            {passwordError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{passwordError}</p>}
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              <Icons.Lock className="h-4 w-4" /> {verifying ? "Verifying…" : "Unlock overview"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!shareData) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-300/50 bg-red-50 p-8 text-center shadow-xl dark:border-red-800/50 dark:bg-red-950/30">
          <Icons.AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-lg font-black text-red-950 dark:text-red-200">Unable to load this link</h1>
          <p className="mt-2 text-sm text-red-800 dark:text-red-300/80">
            {generalError || "Please try again later."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20 sm:p-8 lg:p-10">
          {upcomingGigs[0]?.bandStyles.solid.backgroundColor && (
            <span
              aria-hidden
              className="absolute -right-24 -top-28 h-80 w-80 rounded-full opacity-50 blur-3xl"
              style={{ backgroundColor: upcomingGigs[0].bandStyles.solid.backgroundColor }}
            />
          )}
          <span
            aria-hidden
            className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl"
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <BrandBadge />
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                  <Icons.Link className="h-3.5 w-3.5" /> Read-only share
                </span>
                {shareData.passwordRequired && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-200">
                    <Icons.Lock className="h-3.5 w-3.5" /> Passcode protected
                  </span>
                )}
                {shareData.expiresAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200">
                    <Icons.Clock className="h-3.5 w-3.5" /> Expires {formatDate(shareData.expiresAt)}
                  </span>
                )}
              </div>
              <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                {shareData.title?.trim() || "Shared performance overview"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                A focused view of confirmed dates, bands, venues, notes, and the details selected for sharing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
                <p className="text-2xl font-black text-white">{preparedGigs.length}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Shared gigs</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-xl">
                <p className="text-2xl font-black text-white">{upcomingGigs.length}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Upcoming</p>
              </div>
            </div>
          </div>
        </header>

        <main className="space-y-6 py-6 sm:space-y-8 sm:py-8">
          <NextGigSpotlight
            item={upcomingGigs[0]}
            copied={Boolean(upcomingGigs[0] && copiedGigKey === upcomingGigs[0].key)}
            onCopy={copyGigSummary}
          />
          <PerformanceMetrics
            total={preparedGigs.length}
            upcoming={upcomingGigs.length}
            past={pastGigs.length}
            bandBreakdown={bandBreakdown}
          />
          <CalendarTimeline
            items={timelineGigs}
            expandedGigKeys={expandedGigKeys}
            copiedGigKey={copiedGigKey}
            onToggleGig={toggleGig}
            onCopySummary={copyGigSummary}
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
          />
        </main>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row">
          <span>Shared securely with GigsManager</span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icons.CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Privacy controls applied
          </span>
        </footer>
      </div>
    </div>
  );
}
