"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "./Icons";
import { Calendar as BigCalendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useAuth } from "./AuthProvider";
import type { Gig as AppGig } from "@/types";
import { calculateGigFinancials } from "@/lib/calculations";
import { getBandColorStyles, formatDateTime } from "@/lib/preferences";
import BandTag from "./BandTag";
import { useModalLock } from "@/hooks/useModalLock";

moment.updateLocale("en", {
  week: {
    dow: 1,
  },
});

const localizer = momentLocalizer(moment);

interface Gig {
  id: string;
  eventName: string;
  performers: string;
  date: string;
  isCharity: boolean;
  isTentative?: boolean;
  clientPaymentReceived: boolean;
  bandPaymentComplete: boolean;
  myPayAmount: number;
  setlistId: string | null;
}

// Custom toolbar that shows the current month in month view and the active range in agenda view
function CustomToolbar(props: any) {
  const { date, view, views, onView, onNavigate, rangeLabel } = props;
  const monthYear = moment(date).format("MMMM YYYY");

  return (
    <div className="rbc-toolbar">
      {view === "month" && (
        <div className="rbc-btn-group">
          <button type="button" onClick={() => onNavigate("TODAY")}>
            Today
          </button>
          <button type="button" onClick={() => onNavigate("PREV")}>
            ←
          </button>
          <button type="button" onClick={() => onNavigate("NEXT")}>
            →
          </button>
        </div>
      )}
      <span className="rbc-label">{rangeLabel ?? monthYear}</span>
      <div className="rbc-btn-group">
        {views.map((viewName: string) => (
          <button
            key={viewName}
            type="button"
            className={viewName === view ? "rbc-active" : ""}
            onClick={() => onView(viewName)}
          >
            {viewName.charAt(0).toUpperCase() + viewName.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Gig;
}

interface CalendarViewProps {
  fmtCurrency: (amount: number) => string;
  onEditGig?: (gigId: string) => void;
  gigs?: AppGig[];
}

type DateRangeFilter = "all" | "thisMonth" | "nextMonth" | "lastMonth" | "next3Months" | "past3Months";

export default function CalendarView({ fmtCurrency, onEditGig, gigs: preloadedGigs }: CalendarViewProps) {
  const { getAccessToken } = useAuth();
  const router = useRouter();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(preloadedGigs === undefined);
  // Hydration-safe (#418/#423): start from a deterministic default that both
  // server and client render identically. The viewport-adaptive default is
  // applied post-mount via the restore effect below so the initial HTML matches.
  const [view, setView] = useState<View>("month");
  // Hydration-safe: new Date() in a useState initializer produces a different
  // timestamp on the server vs client (clock skew + request arrival time),
  // which makes React bail out of hydration with a console error. Start from
  // a fixed reference date and let the restore effect below apply the real
  // "today" once the component is mounted.
  const [date, setDate] = useState<Date>(new Date("2024-01-01T00:00:00Z"));
  const [calendarHeight, setCalendarHeight] = useState(600);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [filterCharity, setFilterCharity] = useState(true);
  const [filterTentative, setFilterTentative] = useState(true);
  const [filterPaid, setFilterPaid] = useState(true);
  const [filterUnpaid, setFilterUnpaid] = useState(true);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Compute search matches separately for the dropdown
  const searchMatches = useMemo(() => {
    if (!searchText.trim()) return [];
    const searchLower = searchText.toLowerCase();
    return gigs
      .filter((gig) => {
        const eventNameMatch = gig.eventName.toLowerCase().includes(searchLower);
        const performersMatch = gig.performers.toLowerCase().includes(searchLower);
        return eventNameMatch || performersMatch;
      })
      .slice(0, 10) // Limit to 10 results
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [gigs, searchText]);

  const getDateRangeLabel = (range: DateRangeFilter) => {
    switch (range) {
      case "all":
        return "All gigs";
      case "thisMonth":
        return "This Month";
      case "lastMonth":
        return "Last Month";
      case "nextMonth":
        return "Next Month";
      case "next3Months":
        return "Next 3 Months";
      case "past3Months":
        return "Past 3 Months";
      default:
        return null;
    }
  };

  const getRangeStartDate = (range: DateRangeFilter) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === "all") {
      const earliestGig = gigs.reduce<Date | null>((earliest, gig) => {
        const gigDate = new Date(gig.date);
        if (isNaN(gigDate.getTime())) return earliest;
        gigDate.setHours(0, 0, 0, 0);
        return !earliest || gigDate < earliest ? gigDate : earliest;
      }, null);
      return earliestGig ?? today;
    }

    switch (range) {
      case "lastMonth":
        return new Date(today.getFullYear(), today.getMonth() - 1, 1);
      case "thisMonth":
        return new Date(today.getFullYear(), today.getMonth(), 1);
      case "nextMonth":
      case "next3Months":
        return new Date(today.getFullYear(), today.getMonth() + 1, 1);
      case "past3Months":
        return new Date(today.getFullYear(), today.getMonth() - 3, 1);
      default:
        return today;
    }
  };

  const getRangeEndDate = (range: DateRangeFilter) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case "all": {
        const latestGig = gigs.reduce<Date | null>((latest, gig) => {
          const gigDate = new Date(gig.date);
          if (isNaN(gigDate.getTime())) return latest;
          gigDate.setHours(0, 0, 0, 0);
          return !latest || gigDate > latest ? gigDate : latest;
        }, null);
        return latestGig ?? today;
      }
      case "lastMonth":
        return new Date(today.getFullYear(), today.getMonth(), 0);
      case "thisMonth":
        return new Date(today.getFullYear(), today.getMonth() + 1, 0);
      case "nextMonth":
        return new Date(today.getFullYear(), today.getMonth() + 2, 0);
      case "next3Months":
        return new Date(today.getFullYear(), today.getMonth() + 4, 0);
      case "past3Months":
        return today;
      default:
        return today;
    }
  };

  const agendaLength = useMemo(() => {
    const start = getRangeStartDate(dateRangeFilter);
    const end = getRangeEndDate(dateRangeFilter);
    const diff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    return Math.min(diff, 3660);
  }, [dateRangeFilter, gigs]);

  // Calculate active filter count and labels
  const getActiveFilterLabels = () => {
    const labels: string[] = [];
    if (dateRangeFilter !== "all") {
      const rangeLabel = {
        thisMonth: "This Month",
        lastMonth: "Last Month",
        nextMonth: "Next Month",
        next3Months: "Next 3M",
        past3Months: "Past 3M",
      }[dateRangeFilter];
      labels.push(rangeLabel || "");
    }
    if (!filterCharity) labels.push("No Charity");
    if (!filterTentative) labels.push("No Tentative");
    if (!filterPaid && filterUnpaid) labels.push("Unpaid Only");
    if (filterPaid && !filterUnpaid) labels.push("Paid Only");
    // Search is now a dropdown, not a filter
    return labels.filter(Boolean);
  };

  const clearAllFilters = () => {
    setFilterCharity(true);
    setFilterTentative(true);
    setFilterPaid(true);
    setFilterUnpaid(true);
    setDateRangeFilter("all");
    setSearchText("");
    setDate(new Date());
  };

  const handleRangeSelect = (range: DateRangeFilter) => {
    setDateRangeFilter(range);
    setDate(getRangeStartDate(range));
  };

  const mapToCalendarGigs = useCallback((source: AppGig[]): Gig[] => {
    return source.map((gig) => {
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
        gig.isCharity,
        gig.performanceDistribution,
        gig.managerPerformanceAmount
      );

      return {
        id: gig.id,
        eventName: gig.eventName,
        performers: gig.performers,
        date: String(gig.date),
        isCharity: gig.isCharity,
        isTentative: gig.isTentative,
        clientPaymentReceived: gig.paymentReceived,
        bandPaymentComplete: gig.bandPaid,
        myPayAmount: calc.myEarnings,
        setlistId: gig.setlistId,
      };
    });
  }, []);

  const fetchGigs = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch("/api/gigs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        // Retry on 503 Service Unavailable
        if (response.status === 503) {
          console.warn("[CalendarView] Got 503, retrying in 2 seconds...");
          setTimeout(() => fetchGigs(), 2000);
          return;
        }
        throw new Error(`Failed to fetch (${response.status})`);
      }
      const data = await response.json();
      // Handle both array and object response
      const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
      setGigs(gigsArray);
    } catch (error) {
      console.error("Failed to load gigs:", error);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const updateCalendarHeight = () => {
      const viewportHeight = window.innerHeight;
      if (window.matchMedia("(max-width: 767px)").matches) {
        setCalendarHeight(Math.max(360, Math.min(520, viewportHeight - 300)));
        return;
      }
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setCalendarHeight(Math.max(420, Math.min(580, viewportHeight - 260)));
        return;
      }
      setCalendarHeight(600);
    };

    updateCalendarHeight();
    window.addEventListener("resize", updateCalendarHeight);
    return () => window.removeEventListener("resize", updateCalendarHeight);
  }, []);

  // Hydration-safe (#418/#423): restore the viewport-adaptive view mode and
  // the real "today" date after mount. The initial useState defaults above are
  // deterministic (so server === client HTML), and this effect updates them to
  // the correct runtime values once the component is hydrated.
  useEffect(() => {
    // Restore viewport-adaptive default for mobile/desktop calendar view
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setView("agenda");
    }
    // Restore the real current date (midnight local time) for the calendar display
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDate(today);
  }, []);

  useEffect(() => {
    if (preloadedGigs !== undefined) {
      setGigs(mapToCalendarGigs(preloadedGigs));
      setLoading(false);
      return;
    }
    fetchGigs();
  }, [preloadedGigs, fetchGigs, mapToCalendarGigs]);

  const events: CalendarEvent[] = useMemo(() => {
    // Use TODAY as reference, not the calendar's selected date
      const isInDateRange = (gigDateStr: string): boolean => {
        try {
          const gigDate = new Date(gigDateStr);
          gigDate.setHours(0, 0, 0, 0);
          if (isNaN(gigDate.getTime())) {
            console.warn(`[isInDateRange] Invalid gig date: ${gigDateStr}`);
            return false;
          }

          // Use centralized helpers so all ranges are consistent
          const start = getRangeStartDate(dateRangeFilter);
          const end = getRangeEndDate(dateRangeFilter);

          const passes = gigDate >= start && gigDate <= end;

          if (process.env.NODE_ENV === "development" && dateRangeFilter !== "all") {
            console.debug(`[Filter] gig: ${gigDateStr.substring(0, 10)}, range: ${dateRangeFilter}, start: ${start.toISOString().substring(0,10)}, end: ${end.toISOString().substring(0,10)}, pass: ${passes}`);
          }

          return passes;
        } catch (error) {
          console.error(`[isInDateRange] Error parsing gig date: ${gigDateStr}`, error);
          return false;
        }
      };
    return gigs
      .filter((gig) => {
        // Date range filter
        if (!isInDateRange(gig.date)) return false;

        // Charity/Tentative filter logic
        const isCharity = !!gig.isCharity;
        const isTentative = !!gig.isTentative;

        if (filterCharity && filterTentative) {
          // Both checked: show all
        } else if (!filterCharity && !filterTentative) {
          // Both unchecked: show only regular gigs
          if (isCharity || isTentative) return false;
        } else if (filterCharity && !filterTentative) {
          // Only charity checked
          if (!isCharity) return false;
        } else if (!filterCharity && filterTentative) {
          // Only tentative checked
          if (!isTentative) return false;
        }

        // Payment status filter (only apply if at least one payment filter is active)
        if (filterPaid || filterUnpaid) {
          if (gig.clientPaymentReceived && !filterPaid) return false;
          if (!gig.clientPaymentReceived && !filterUnpaid) return false;
        }

        // Search filter is now handled separately in dropdown (not applied here)
        return true;
      })
      .map((gig) => {
        const gigDate = new Date(gig.date);
        return {
          id: gig.id,
          title: gig.eventName,
          start: gigDate,
          end: new Date(gigDate.getTime() + 3 * 60 * 60 * 1000), // 3 hours duration
          resource: gig,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime()); // Sort chronologically
  }, [gigs, filterCharity, filterTentative, filterPaid, filterUnpaid, dateRangeFilter]);

  const eventStyleGetter = (event: CalendarEvent) => {
    const gig = event.resource;

    const bandStyles = getBandColorStyles(gig.performers || gig.eventName);
    let backgroundColor: string = bandStyles.solid.backgroundColor;
    let borderColor: string = bandStyles.solid.borderColor;

    if (gig.isCharity) {
      backgroundColor = "#ec4899"; // pink-500
      borderColor = "#db2777"; // pink-600
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderWidth: "2px",
        borderStyle: "solid",
        borderRadius: "6px",
        color: "white",
        fontWeight: "600",
        fontSize: "13px",
        padding: "2px 6px",
      },
    };
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
  };

  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    isOpen: selectedEvent !== null,
    onClose: handleCloseModal,
  });

  const handleEditClick = () => {
    if (selectedEvent && onEditGig) {
      onEditGig(selectedEvent.id);
      handleCloseModal();
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Calendar View
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Visual timeline of your gigs
        </p>
      </div>

      {/* Active Filters Badge */}
      {getActiveFilterLabels().length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-900/30 dark:bg-brand-900/10">
          <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">Active Filters:</span>
          {getActiveFilterLabels().map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-brand-200 px-2 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
            >
              {label}
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Clear All →
          </button>
        </div>
      )}

      {/* Search Autocomplete Dropdown */}
      <div className="relative rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="🔍 Search gigs by name or performer..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setShowSearchDropdown(e.target.value.length > 0);
            }}
            onFocus={() => setShowSearchDropdown(searchText.length > 0)}
            onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-400"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                setShowSearchDropdown(false);
              }}
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Search Results Dropdown */}
        {showSearchDropdown && searchMatches.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-40 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="max-h-64 overflow-y-auto">
              {searchMatches.map((gig) => (
                <button
                  key={gig.id}
                  type="button"
                  onClick={() => {
                    setSearchText("");
                    setShowSearchDropdown(false);
                    setSelectedEvent({
                      id: gig.id,
                      title: gig.eventName,
                      start: new Date(gig.date),
                      end: new Date(new Date(gig.date).getTime() + 3 * 60 * 60 * 1000),
                      resource: gig,
                    });
                  }}
                  className="w-full border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 last:border-b-0"
                >
                  <div className="font-medium text-slate-900 dark:text-white">{gig.eventName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(gig.date)} · {gig.performers}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {showSearchDropdown && searchText && searchMatches.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-40 mt-1 rounded-lg border border-slate-200 bg-white p-3 text-center text-sm text-slate-500 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            No gigs found matching "{searchText}"
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterCharity}
            onChange={(e) => setFilterCharity(e.target.checked)}
            className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-pink-600 focus:ring-2 focus:ring-pink-500/20 cursor-pointer"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">💕 Charity</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterTentative}
            onChange={(e) => setFilterTentative(e.target.checked)}
            className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">⏳ Tentative</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterPaid}
            onChange={(e) => setFilterPaid(e.target.checked)}
            className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-green-600 focus:ring-2 focus:ring-green-500/20 cursor-pointer"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">✓ Paid</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterUnpaid}
            onChange={(e) => setFilterUnpaid(e.target.checked)}
            className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">⏳ Unpaid</span>
        </label>
      </div>

      {/* Date Range Filters - Only for Agenda/List View */}
      {view === "agenda" && (
      <div className="flex flex-wrap gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10">
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 w-full mb-2">📋 Time Range (for list view):</span>
        <button
          type="button"
          onClick={() => handleRangeSelect("all")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "all"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => handleRangeSelect("lastMonth")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "lastMonth"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Last Month
        </button>
        <button
          type="button"
          onClick={() => handleRangeSelect("thisMonth")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "thisMonth"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          This Month
        </button>
        <button
          type="button"
          onClick={() => handleRangeSelect("nextMonth")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "nextMonth"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Next Month
        </button>
        <button
          type="button"
          onClick={() => handleRangeSelect("next3Months")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "next3Months"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Next 3 Months
        </button>
        <button
          type="button"
          onClick={() => handleRangeSelect("past3Months")}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            dateRangeFilter === "past3Months"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Past 3 Months
        </button>
      </div>
      )}

      {/* Date Navigation - Only visible in Month View */}
      {view === "month" && (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setDate(new Date())}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Today
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const prev = new Date(date);
              prev.setMonth(prev.getMonth() - 1);
              setDate(prev);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ←
          </button>
          <select
            value={date.getFullYear() * 100 + date.getMonth()}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              const year = Math.floor(val / 100);
              const month = val % 100;
              const newDate = new Date(date);
              newDate.setFullYear(year);
              newDate.setMonth(month);
              setDate(newDate);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {(() => {
              const options = [];
              const now = new Date();
              for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 2; y++) {
                for (let m = 0; m < 12; m++) {
                  const label = new Date(y, m).toLocaleDateString("default", {
                    year: "numeric",
                    month: "long",
                  });
                  options.push(
                    <option key={`${y}-${m}`} value={y * 100 + m}>
                      {label}
                    </option>
                  );
                }
              }
              return options;
            })()}
          </select>
          <button
            type="button"
            onClick={() => {
              const next = new Date(date);
              next.setMonth(next.getMonth() + 1);
              setDate(next);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            →
          </button>
        </div>
        <select
          value={date.getFullYear()}
          onChange={(e) => {
            const newDate = new Date(date);
            newDate.setFullYear(parseInt(e.target.value));
            setDate(newDate);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {(() => {
            const options = [];
            const now = new Date();
            for (let y = now.getFullYear() - 5; y <= now.getFullYear() + 5; y++) {
              options.push(
                <option key={y} value={y}>
                  {y}
                </option>
              );
            }
            return options;
          })()}
        </select>
      </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-pink-600 bg-pink-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Charity</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-emerald-600 bg-emerald-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Fully Paid</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-amber-600 bg-amber-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Client Paid</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border-2 border-slate-600 bg-slate-500"></div>
          <span className="text-sm text-slate-700 dark:text-slate-300">Awaiting Payment</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Gigs</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{events.length}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Earnings</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">
              {fmtCurrency(events.reduce((sum, e) => sum + e.resource.myPayAmount, 0))}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">View</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{view === "month" ? "📅 Month" : "📋 Agenda"}</p>
        </div>
      </div>

      {/* Time Range Info Banner (especially for list view) */}
      {view === "agenda" && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            📋 Showing all gigs in{" "}
            <span className="font-semibold">
              {dateRangeFilter === "all"
                ? "all time"
                : dateRangeFilter === "thisMonth"
                ? "this month"
                : dateRangeFilter === "lastMonth"
                ? "last month"
                : dateRangeFilter === "nextMonth"
                ? "next month"
                : dateRangeFilter === "next3Months"
                ? "next 3 months"
                : "past 3 months"}
            </span>
            {searchText && `, matching "${searchText}"`}
          </span>
        </div>
      )}

      {/* Calendar */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="calendar-wrapper responsive-scroll-x p-3 sm:p-4">
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: calendarHeight, minWidth: view === "month" ? 320 : undefined }}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            length={view === "agenda" ? agendaLength : undefined}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={handleSelectEvent}
            views={["month", "agenda"]}
            popup
            toolbar={true}
            components={{
              toolbar: (toolbarProps) => (
                <CustomToolbar
                  {...toolbarProps}
                  rangeLabel={view === "agenda" ? getDateRangeLabel(dateRangeFilter) : null}
                />
              ),
            }}
          />
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
          onClick={handleBackdropClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="modal-sheet-mobile w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl modal-content-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-700/50 dark:bg-slate-800/50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-cyan-300">
                    {selectedEvent.resource.eventName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {formatDateTime(selectedEvent.resource.date)}
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  aria-label="Close"
                  className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <Icons.Close className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-6">
              {/* Type Badge */}
              <div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    selectedEvent.resource.isCharity
                      ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
                  {selectedEvent.resource.isCharity ? "Charity Event" : <BandTag name={selectedEvent.resource.performers} variant="solid" />}
                </span>
              </div>

              {/* Setlist Link */}
              {selectedEvent.resource.setlistId && (
                <button
                  onClick={() => {
                    router.push(`/?tab=setlists&setlist=${selectedEvent.resource.setlistId}`);
                    handleCloseModal();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-900/30 dark:bg-cyan-900/10 dark:text-cyan-300 dark:hover:bg-cyan-900/20"
                >
                  <Icons.ListView className="h-4 w-4" />
                  View Setlist
                </button>
              )}

              {/* Payment Info */}
              {!selectedEvent.resource.isCharity && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      My Earnings
                    </span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {fmtCurrency(selectedEvent.resource.myPayAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Client Payment
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        selectedEvent.resource.clientPaymentReceived
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {selectedEvent.resource.clientPaymentReceived ? "Received ✓" : "Pending"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Band Payment
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                        selectedEvent.resource.bandPaymentComplete
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {selectedEvent.resource.bandPaymentComplete ? "Complete ✓" : "Pending"}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {onEditGig && (
                  <button
                    onClick={handleEditClick}
                    className="touch-target inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    View/Edit Gig
                  </button>
                )}
                <button
                  onClick={handleCloseModal}
                  className="touch-target inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles */}
      <style jsx global>{`
        .calendar-wrapper .rbc-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px;
          margin-bottom: 12px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          flex-wrap: wrap;
        }
        
        .dark .calendar-wrapper .rbc-toolbar {
          background: #1e293b;
          border-color: #334155;
        }
        
        .calendar-wrapper .rbc-toolbar .rbc-label {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          letter-spacing: 0.5px;
          flex: 1;
          text-align: center;
        }
        
        .dark .calendar-wrapper .rbc-toolbar .rbc-label {
          color: #f1f5f9;
        }
        
        .calendar-wrapper .rbc-toolbar .rbc-btn-group {
          display: flex;
          gap: 4px;
        }
        
        .calendar-wrapper .rbc-toolbar .rbc-btn-group button {
          color: #475569;
          border-color: #cbd5e1;
          border: 1px solid #cbd5e1;
          background: white;
          font-weight: 500;
          padding: 6px 12px;
          border-radius: 6px;
          transition: all 0.2s;
          cursor: pointer;
          font-size: 14px;
        }
        
        .dark .calendar-wrapper .rbc-toolbar .rbc-btn-group button {
          color: #cbd5e1;
          border-color: #475569;
          background: #1e293b;
        }
        
        .calendar-wrapper .rbc-toolbar .rbc-btn-group button:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        
        .dark .calendar-wrapper .rbc-toolbar .rbc-btn-group button:hover {
          background: #334155;
          border-color: #64748b;
        }
        
        .calendar-wrapper .rbc-toolbar .rbc-btn-group button.rbc-active {
          background: #0ea5e9;
          color: white;
          border-color: #0284c7;
        }
        
        .dark .calendar-wrapper .rbc-toolbar .rbc-btn-group button.rbc-active {
          background: #0ea5e9;
          color: white;
          border-color: #0284c7;
        }
        
        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }
        
        .calendar-wrapper .rbc-header {
          padding: 12px 4px;
          font-weight: 600;
          color: #475569;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .dark .calendar-wrapper .rbc-header {
          color: #cbd5e1;
          background: #1e293b;
          border-bottom-color: #334155;
        }
        
        .calendar-wrapper .rbc-today {
          background-color: #f0f9ff;
        }
        
        .dark .calendar-wrapper .rbc-today {
          background-color: #0c4a6e;
        }
        
        .calendar-wrapper .rbc-off-range-bg {
          background: #f8fafc;
        }
        
        .dark .calendar-wrapper .rbc-off-range-bg {
          background: #0f172a;
        }
        
        .calendar-wrapper .rbc-date-cell {
          padding: 6px;
          font-weight: 500;
        }
        
        .calendar-wrapper .rbc-event {
          border-radius: 6px;
          padding: 2px 6px;
        }
        
        .calendar-wrapper .rbc-month-view,
        .calendar-wrapper .rbc-time-view {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .dark .calendar-wrapper .rbc-month-view,
        .dark .calendar-wrapper .rbc-time-view {
          border-color: #334155;
        }

        /* Agenda/List View Styling */
        .calendar-wrapper .rbc-agenda-view {
          font-size: 14px;
        }

        .calendar-wrapper .rbc-agenda-view table {
          width: 100%;
          border-collapse: collapse;
        }

        .calendar-wrapper .rbc-agenda-view table tbody > tr > td {
          padding: 12px;
          vertical-align: middle;
        }

        .calendar-wrapper .rbc-agenda-view table tbody > tr {
          border-bottom: 1px solid #e2e8f0;
          transition: background-color 0.15s;
        }

        .dark .calendar-wrapper .rbc-agenda-view table tbody > tr {
          border-bottom-color: #334155;
        }

        .calendar-wrapper .rbc-agenda-view table tbody > tr:hover {
          background-color: #f8fafc;
          cursor: pointer;
        }

        .dark .calendar-wrapper .rbc-agenda-view table tbody > tr:hover {
          background-color: #1e293b;
        }

        .calendar-wrapper .rbc-agenda-view table thead > tr > th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #475569;
        }

        .dark .calendar-wrapper .rbc-agenda-view table thead > tr > th {
          background: #1e293b;
          border-bottom-color: #334155;
          color: #cbd5e1;
        }

        .calendar-wrapper .rbc-agenda-view table tbody > tr > td:first-child {
          font-weight: 500;
          color: #1e293b;
          min-width: 150px;
        }

        .dark .calendar-wrapper .rbc-agenda-view table tbody > tr > td:first-child {
          color: #f1f5f9;
        }

        .calendar-wrapper .rbc-agenda-date-cell,
        .calendar-wrapper .rbc-agenda-time-cell {
          color: #64748b;
        }

        .dark .calendar-wrapper .rbc-agenda-date-cell,
        .dark .calendar-wrapper .rbc-agenda-time-cell {
          color: #94a3b8;
        }

        .calendar-wrapper .rbc-agenda-event-cell {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
