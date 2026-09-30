"use client";

import { useState, useMemo, useDeferredValue, useEffect, useCallback } from "react";
import type { Gig } from "@/types";
import GigCard from "./GigCard";
import BandTag from "./BandTag";
import { useSettings } from "./SettingsProvider";
import { Icons } from "./Icons";
import { useTranslation } from "react-i18next";
import { calculateGigFinancials, formatDate } from "@/lib/calculations";
import { generateGigsCsv, downloadCsv } from "@/lib/export";
import {
  applyGigFilters,
  calculateGigKpis,
  isGigPaid,
  isGigUnpaid,
  isGigTentative,
  isGigConfirmed,
  isGigCancelled,
  isGigCharity,
  type GigStatusFilter,
  type DatePreset,
} from "@/lib/gig-filters";
import { useRouter } from "next/navigation";

interface AllGigsTabProps {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  fmtCurrency: (amount: number) => string;
  loading: boolean;
  onDelete?: (gig: Gig) => void;
  onDuplicate?: (gig: Gig) => void;
  onAddNew?: () => void;
}

type SortOption =
  | "date-asc"
  | "date-desc"
  | "band-asc"
  | "band-desc"
  | "fee-high"
  | "fee-low"
  | "payment-status"
  | "chronology";

type ViewMode = "grid" | "table";

export default function AllGigsTab({
  gigs,
  onEdit,
  fmtCurrency,
  loading,
  onDelete,
  onDuplicate,
  onAddNew,
}: AllGigsTabProps) {
  const router = useRouter();
  const { locale } = useSettings();
  const isDutch = locale.startsWith("nl");
  const { t } = useTranslation();
  const PAGE_SIZE = 24;

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("date-asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [globalExpandState, setGlobalExpandState] = useState<boolean | undefined>(undefined);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<GigStatusFilter>>(new Set());
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hidePastGigs, setHidePastGigs] = useState(false);

  const deferredGigs = useDeferredValue(gigs);

  // Sort options
  const sortOptions = [
    { value: "date-asc" as const, label: t("gigs.soonestFirst", "Soonest first") },
    { value: "date-desc" as const, label: t("gigs.latestFirst", "Latest first") },
    { value: "band-asc" as const, label: t("gigs.bandAz", "Band A-Z") },
    { value: "band-desc" as const, label: t("gigs.bandZa", "Band Z-A") },
    { value: "fee-high" as const, label: t("gigs.highestFee", "Highest Fee") },
    { value: "fee-low" as const, label: t("gigs.lowestFee", "Lowest Fee") },
    { value: "payment-status" as const, label: t("gigs.paymentStatus", "Payment Status") },
    { value: "chronology" as const, label: t("gigs.chronology", "Chronology (upcoming first)") },
  ];

  // Get all unique artists with their gig counts
  const artistCounts = useMemo(() => {
    const map = new Map<string, number>();
    deferredGigs.forEach((gig) => {
      if (gig.performers) {
        map.set(gig.performers, (map.get(gig.performers) || 0) + 1);
      }
    });
    return map;
  }, [deferredGigs]);

  const artists = useMemo(() => {
    return Array.from(artistCounts.keys()).sort();
  }, [artistCounts]);

  // Overall KPI metrics from all gigs
  const kpis = useMemo(() => calculateGigKpis(deferredGigs), [deferredGigs]);

  // Apply strict logical AND filter engine
  const filteredGigs = useMemo(() => {
    return applyGigFilters(deferredGigs, {
      searchText,
      selectedArtists,
      statusFilters,
      datePreset,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      hidePastGigs,
    });
  }, [deferredGigs, searchText, selectedArtists, statusFilters, datePreset, startDate, endDate, hidePastGigs]);

  // Sort filtered gigs
  const sortedGigs = useMemo(() => {
    const sorted = [...filteredGigs];

    switch (sortBy) {
      case "date-desc":
        sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case "date-asc":
        sorted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        break;
      case "band-asc":
        sorted.sort((a, b) => a.performers.localeCompare(b.performers) || new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case "band-desc":
        sorted.sort((a, b) => b.performers.localeCompare(a.performers) || new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case "fee-high":
        sorted.sort(
          (a, b) =>
            b.performanceFee + b.technicalFee - (a.performanceFee + a.technicalFee)
        );
        break;
      case "fee-low":
        sorted.sort(
          (a, b) =>
            a.performanceFee + a.technicalFee - (b.performanceFee + b.technicalFee)
        );
        break;
      case "payment-status":
        sorted.sort((a, b) => {
          const aScore = (isGigPaid(a) ? 2 : 0) + (a.bandPaid ? 1 : 0);
          const bScore = (isGigPaid(b) ? 2 : 0) + (b.bandPaid ? 1 : 0);
          return bScore - aScore || new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        break;
      case "chronology": {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const future = sorted.filter((g) => new Date(g.date) >= today);
        const past = sorted.filter((g) => new Date(g.date) < today);
        future.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return [...future, ...past];
      }
    }

    return sorted;
  }, [filteredGigs, sortBy]);

  // Reset pagination when filters or sort change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortBy, selectedArtists, statusFilters, datePreset, startDate, endDate, hidePastGigs, searchText]);

  const visibleGigs = useMemo(
    () => sortedGigs.slice(0, visibleCount),
    [sortedGigs, visibleCount]
  );

  const remainingCount = Math.max(0, sortedGigs.length - visibleCount);

  // Toggle single artist filter
  const toggleArtist = (artist: string) => {
    setSelectedArtists((prev) => {
      const updated = new Set(prev);
      if (updated.has(artist)) {
        updated.delete(artist);
      } else {
        updated.add(artist);
      }
      return updated;
    });
  };

  // Toggle status filter pill
  const toggleStatusFilter = (status: GigStatusFilter) => {
    if (status === "all") {
      setStatusFilters(new Set());
      return;
    }

    setStatusFilters((prev) => {
      const updated = new Set(prev);
      if (updated.has(status)) {
        updated.delete(status);
      } else {
        updated.add(status);
      }
      return updated;
    });
  };

  // Quick reset for all filters
  const handleResetFilters = useCallback(() => {
    setSearchText("");
    setSelectedArtists(new Set());
    setStatusFilters(new Set());
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
    setHidePastGigs(false);
  }, []);

  // Check if any filter is actively applied
  const hasActiveFilters = useMemo(() => {
    return (
      Boolean(searchText.trim()) ||
      selectedArtists.size > 0 ||
      statusFilters.size > 0 ||
      datePreset !== "all" ||
      Boolean(startDate) ||
      Boolean(endDate) ||
      hidePastGigs
    );
  }, [searchText, selectedArtists, statusFilters, datePreset, startDate, endDate, hidePastGigs]);

  // Export filtered gigs to CSV
  const handleExportCsv = () => {
    const csvContent = generateGigsCsv(sortedGigs, fmtCurrency);
    const dateStr = new Date().toISOString().split("T")[0];
    downloadCsv(csvContent, `gigs-export-${dateStr}.csv`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Icons.Spinner className="h-10 w-10 text-brand-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {t("dashboard.loadingSection", "Loading performances...")}
        </p>
      </div>
    );
  }

  if (gigs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 py-20 text-center shadow-sm">
        <div className="p-4 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 mb-4 ring-1 ring-brand-500/20">
          <Icons.Music2 className="h-10 w-10" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {t("gigs.noPerformancesYet", "No performances yet")}
        </h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {isDutch
            ? "Voeg je eerste optreden toe om inkomsten, bezetting en statussen bij te houden."
            : "Add your first performance to start tracking earnings, lineups, and payment statuses."}
        </p>
        {onAddNew && (
          <button
            onClick={onAddNew}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-500 transition-all"
          >
            <Icons.Plus className="h-4 w-4" />
            {t("gigs.newGig", "New Performance")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. Header & KPI Summary Cards                                             */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span>{t("gigs.title", "All Performances")}</span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {sortedGigs.length} {sortedGigs.length === 1 ? "gig" : "gigs"}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isDutch
              ? "Overzicht van alle boekingen, betalingen en financiële details"
              : "Comprehensive overview of bookings, financial states, and performance statuses"}
          </p>
        </div>

        {/* Global actions: Add Gig + Export CSV */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportCsv}
            title={isDutch ? "Exporteer gefilterde lijst naar CSV" : "Export filtered list to CSV"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <Icons.Download className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>{t("gigs.export", "Export CSV")}</span>
          </button>

          {onAddNew && (
            <button
              onClick={onAddNew}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-brand-500 active:scale-95 transition"
            >
              <Icons.Plus className="h-4 w-4" />
              <span>{t("gigs.newGig", "New Performance")}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Card 1: Total Gigs */}
        <button
          onClick={() => setStatusFilters(new Set())}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 backdrop-blur ${
            statusFilters.size === 0
              ? "border-brand-500/50 bg-brand-50/40 dark:bg-brand-950/20 shadow-sm ring-1 ring-brand-500/20"
              : "border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t("gigs.total", "Total Gigs")}
            </span>
            <span className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Icons.Calendar className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {kpis.totalCount}
            </span>
            <span className="text-xs text-slate-400">
              ({kpis.confirmedCount} {t("gigs.confirmed", "confirmed").toLowerCase()})
            </span>
          </div>
        </button>

        {/* Card 2: Upcoming Gigs */}
        <button
          onClick={() => {
            setDatePreset((prev) => (prev === "upcoming" ? "all" : "upcoming"));
          }}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 backdrop-blur ${
            datePreset === "upcoming"
              ? "border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-500/20"
              : "border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t("gigs.upcoming", "Upcoming")}
            </span>
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Icons.CheckCircle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {kpis.upcomingCount}
            </span>
            <span className="text-xs text-slate-400">{isDutch ? "in de toekomst" : "scheduled"}</span>
          </div>
        </button>

        {/* Card 3: Outstanding Unpaid */}
        <button
          onClick={() => toggleStatusFilter("unpaid")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 backdrop-blur ${
            statusFilters.has("unpaid")
              ? "border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm ring-1 ring-amber-500/20"
              : "border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {t("gigs.unpaid", "Unpaid")}
            </span>
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Icons.AlertCircle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {kpis.unpaidCount}
              </span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                ({fmtCurrency(kpis.unpaidTotalAmount)})
              </span>
            </div>
          </div>
        </button>

        {/* Card 4: Tentative Bookings */}
        <button
          onClick={() => toggleStatusFilter("tentative")}
          className={`rounded-2xl border p-4 text-left transition-all duration-200 backdrop-blur ${
            statusFilters.has("tentative")
              ? "border-yellow-500/50 bg-yellow-50/40 dark:bg-yellow-950/20 shadow-sm ring-1 ring-yellow-500/20"
              : "border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
              {t("gigs.tentative", "Tentative")}
            </span>
            <span className="p-2 rounded-xl bg-yellow-50 dark:bg-yellow-950/50 text-yellow-600 dark:text-yellow-400">
              <Icons.Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
              {kpis.tentativeCount}
            </span>
            <span className="text-xs text-slate-400">{isDutch ? "opties" : "options"}</span>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. Unified Filter & Search Toolbar                                        */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-4 shadow-sm backdrop-blur space-y-4">
        {/* Top Row: Search Input + Date Preset Dropdown + View Switcher */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Icons.Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={isDutch ? "Zoek op optreden, artiest, venue, notities..." : "Search by event, artist, venue, notes..."}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 pl-10 pr-9 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
                title="Clear search"
              >
                <Icons.Close className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date preset selector + Sort selector + View mode toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset */}
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 focus:border-brand-500 focus:outline-none"
            >
              <option value="all">{isDutch ? "Alle data" : "All dates"}</option>
              <option value="upcoming">{isDutch ? "Toekomstig" : "Upcoming only"}</option>
              <option value="past">{isDutch ? "Verleden" : "Past only"}</option>
              <option value="this-month">{isDutch ? "Deze maand" : "This month"}</option>
              <option value="this-year">{isDutch ? "Dit jaar" : "This year"}</option>
              <option value="custom">{isDutch ? "Aangepast bereik" : "Custom range"}</option>
            </select>

            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 focus:border-brand-500 focus:outline-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* View Mode Toggle: Grid vs Table */}
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title={isDutch ? "Kaartenweergave" : "Card Grid View"}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <Icons.GridView className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                title={isDutch ? "Lijstweergave" : "Compact List View"}
                className={`rounded-lg p-1.5 transition ${
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <Icons.ListView className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Custom date range picker if 'custom' is selected */}
        {datePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 animate-fade-in">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isDutch ? "Van:" : "From:"}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isDutch ? "Tot:" : "To:"}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
              >
                {t("gigs.clearAll", "Clear")}
              </button>
            )}
          </div>
        )}

        {/* Status Filter Tabs / Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1.5">
            {t("gigs.status", "Status")}:
          </span>

          <button
            type="button"
            onClick={() => toggleStatusFilter("all")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              statusFilters.size === 0
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t("common.all", "All")}
          </button>

          <button
            type="button"
            onClick={() => toggleStatusFilter("confirmed")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilters.has("confirmed")
                ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            }`}
          >
            <span>✓</span>
            <span>{t("gigs.confirmed", "Confirmed")}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStatusFilter("tentative")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilters.has("tentative")
                ? "bg-amber-600 text-white shadow-sm ring-1 ring-amber-500"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
            }`}
          >
            <span>⏳</span>
            <span>{t("gigs.tentative", "Tentative")}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStatusFilter("paid")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilters.has("paid")
                ? "bg-green-600 text-white shadow-sm ring-1 ring-green-500"
                : "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-900/50"
            }`}
          >
            <span>💰</span>
            <span>{t("gigs.paid", "Paid")}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStatusFilter("unpaid")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilters.has("unpaid")
                ? "bg-orange-600 text-white shadow-sm ring-1 ring-orange-500"
                : "bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/50"
            }`}
          >
            <span>⚠️</span>
            <span>{t("gigs.unpaid", "Unpaid")}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStatusFilter("charity")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
              statusFilters.has("charity")
                ? "bg-pink-600 text-white shadow-sm ring-1 ring-pink-500"
                : "bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-950/40 dark:text-pink-300 dark:hover:bg-pink-900/50"
            }`}
          >
            <span>💕</span>
            <span>{t("gigs.showCharity", "Charity")}</span>
          </button>

          <div className="ml-auto flex items-center gap-3">
            {/* Hide past gigs toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={hidePastGigs}
                onChange={(e) => setHidePastGigs(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <span>{t("gigs.hidePastGigs", "Hide past")}</span>
            </label>

            {/* Expand / Collapse All */}
            {viewMode === "grid" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGlobalExpandState(true)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  title={t("gigs.expandAll", "Expand all")}
                >
                  <Icons.Expand className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalExpandState(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  title={t("gigs.collapseAll", "Collapse all")}
                >
                  <Icons.ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Artist filter pills */}
        {artists.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("gigs.filterByArtist", "Filter by Band / Artist")}:
              </span>
              {selectedArtists.size > 0 && (
                <button
                  onClick={() => setSelectedArtists(new Set())}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  {t("gigs.clearAll", "Clear all")} ({selectedArtists.size})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {artists.map((artist) => {
                const isSelected = selectedArtists.has(artist);
                const count = artistCounts.get(artist) || 0;
                return (
                  <button
                    key={artist}
                    type="button"
                    onClick={() => toggleArtist(artist)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                      isSelected
                        ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                        : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <BandTag name={artist} variant={isSelected ? "solid" : "soft"} />
                    <span className="opacity-70 text-[11px]">({count})</span>
                    {isSelected && <Icons.Check className="h-3 w-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Filter Chips Bar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-400 font-medium mr-1">
              {isDutch ? "Actieve filters:" : "Active filters:"}
            </span>

            {/* Search chip */}
            {searchText && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs text-brand-700 dark:text-brand-300">
                <span>"{searchText}"</span>
                <button onClick={() => setSearchText("")} className="hover:text-brand-900">
                  <Icons.Close className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Date Preset Chip */}
            {datePreset !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs text-slate-700 dark:text-slate-300">
                <span>
                  {datePreset === "upcoming"
                    ? "Upcoming"
                    : datePreset === "past"
                    ? "Past"
                    : datePreset === "this-month"
                    ? "This month"
                    : datePreset === "this-year"
                    ? "This year"
                    : "Custom dates"}
                </span>
                <button onClick={() => setDatePreset("all")} className="hover:text-slate-900">
                  <Icons.Close className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Hide past gigs chip */}
            {hidePastGigs && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs text-slate-700 dark:text-slate-300">
                <span>Hide Past</span>
                <button onClick={() => setHidePastGigs(false)} className="hover:text-slate-900">
                  <Icons.Close className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Status chips */}
            {Array.from(statusFilters).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300 capitalize"
              >
                <span>{s}</span>
                <button onClick={() => toggleStatusFilter(s)} className="hover:text-brand-900">
                  <Icons.Close className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* Artist chips */}
            {Array.from(selectedArtists).map((artist) => (
              <span
                key={artist}
                className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300"
              >
                <span>{artist}</span>
                <button onClick={() => toggleArtist(artist)} className="hover:text-purple-900">
                  <Icons.Close className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* Clear All button */}
            <button
              onClick={handleResetFilters}
              className="ml-auto text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
            >
              {t("gigs.clearAll", "Clear all filters")}
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. Results Section (Grid View or Compact List / Table View)               */}
      {/* ========================================================================= */}
      {sortedGigs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-900/30 py-16 px-4 text-center">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
            <Icons.AlertCircle className="h-8 w-8" />
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-white">
            {t("gigs.noMatches", "No performances match your filters")}
          </p>
          <p className="mt-1 max-w-md text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {t(
              "gigs.adjustFilters",
              "Try clearing active search criteria, broadening status selections, or adjusting the date range."
            )}
          </p>
          <button
            onClick={handleResetFilters}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <span>{t("gigs.clearAll", "Reset All Filters")}</span>
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* Card Grid View */
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-1">
            {visibleGigs.map((gig, idx) => (
              <div key={gig.id} className={`animate-fade-in animate-stagger-${Math.min(idx + 1, 10)}`}>
                <GigCard
                  gig={gig}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  fmtCurrency={fmtCurrency}
                  claimPerformanceFee={gig.claimPerformanceFee}
                  claimTechnicalFee={gig.claimTechnicalFee}
                  isExpandedGlobal={globalExpandState}
                  onRequestLocalToggle={() => setGlobalExpandState(undefined)}
                />
              </div>
            ))}
          </div>

          {remainingCount > 0 && (
            <div className="flex justify-center pt-3">
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                {t("gigs.loadMore", "Load more")} ({remainingCount} {t("gigs.left", "left")})
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Compact List / Table View */
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">{t("gigs.date", "Date")}</th>
                    <th className="px-4 py-3">{t("gigs.eventName", "Performance")}</th>
                    <th className="px-4 py-3">{t("gigs.status", "Status")}</th>
                    <th className="px-4 py-3 text-right">{isDutch ? "Totaal Fee" : "Total Fee"}</th>
                    <th className="px-4 py-3 text-right">{isDutch ? "Mijn Deel" : "My Share"}</th>
                    <th className="px-4 py-3 text-right">{t("common.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {visibleGigs.map((gig) => {
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

                    const paid = isGigPaid(gig);
                    const unpaid = isGigUnpaid(gig);
                    const tentative = isGigTentative(gig);

                    return (
                      <tr
                        key={gig.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Date */}
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(gig.date)}
                        </td>

                        {/* Event & Artist */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {gig.eventName}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <BandTag name={gig.performers} variant={gig.band?.color ? "solid" : "soft"} color={gig.band?.color} />
                            {gig.numberOfMusicians > 1 && (
                              <span className="text-xs text-slate-400">
                                · {gig.numberOfMusicians} mus.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Badges */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1">
                            {tentative ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-600/20">
                                ⏳ Tentative
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-600/20">
                                ✓ Confirmed
                              </span>
                            )}

                            {paid ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-green-600/20">
                                💰 Paid
                              </span>
                            ) : unpaid ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-950 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300 ring-1 ring-orange-600/20">
                                ⏳ Unpaid
                              </span>
                            ) : null}

                            {gig.isCharity && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-950 px-2 py-0.5 text-xs font-medium text-pink-700 dark:text-pink-300 ring-1 ring-pink-600/20">
                                💕 Charity
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Total Fee */}
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {gig.performanceFeeUnknown ? "Unknown" : fmtCurrency(calc.totalReceived)}
                        </td>

                        {/* My Share */}
                        <td className="px-4 py-3 text-right font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">
                          {fmtCurrency(calc.myEarnings)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-end">
                            {gig.setlistId && (
                              <button
                                onClick={() => router.push(`/app?tab=setlists&setlist=${gig.setlistId}`)}
                                title={isDutch ? "Bekijk setlist" : "View setlist"}
                                className="rounded-lg p-1.5 text-cyan-600 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/50"
                              >
                                <Icons.ListView className="h-4 w-4" />
                              </button>
                            )}
                            {onDuplicate && (
                              <button
                                onClick={() => onDuplicate(gig)}
                                title={isDutch ? "Dupliceer" : "Duplicate"}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              >
                                <Icons.Copy className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => onEdit(gig)}
                              title={isDutch ? "Bewerken" : "Edit"}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40 dark:hover:text-brand-300"
                            >
                              <Icons.Edit className="h-4 w-4" />
                            </button>
                            {onDelete && (
                              <button
                                onClick={() => onDelete(gig)}
                                title={isDutch ? "Verwijderen" : "Delete"}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              >
                                <Icons.Trash className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {remainingCount > 0 && (
            <div className="flex justify-center pt-3">
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                {t("gigs.loadMore", "Load more")} ({remainingCount} {t("gigs.left", "left")})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
