"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy, useDeferredValue, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Avatar from "./Avatar";
import { recordWebVital } from "@/lib/web-vitals-logger";
import { recordMetric } from "@/lib/performance-metrics";
import type { Gig, GigFormData, DashboardSummary, UserSettingsData } from "@/types";
import { calculateGigFinancials } from "@/lib/calculations";
import { summarizeDashboardFinancials } from "@/lib/dashboard-financials";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import { Icons } from "./Icons";
import LandingPage from "./LandingPage";
import GigCard from "./GigCard";
import GigForm from "./GigForm";
import DeleteConfirm from "./DeleteConfirm";
import SettingsModal from "./SettingsModal";
import Footer from "./Footer";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { DashboardSummary as DashboardSummaryComponent } from "./DashboardSummary";
import BulkEditor from "./BulkEditor";
import { useTranslation } from "react-i18next";

import LoadingSpinner, { CardSkeleton } from "./LoadingSpinner";
import { useOnlineStatus } from "@/lib/offline/hooks";

// Lazy load heavy components for better initial load time
const AnalyticsPage = lazy(() => import("./AnalyticsPage"));
const AIPredictionsTab = lazy(() => import("./AIPredictionsTab"));
const InvestmentsTab = lazy(() => import("./InvestmentsTab"));
const AllGigsTab = lazy(() => import("./AllGigsTab"));
const BandMembers = lazy(() => import("./BandMembers"));
const BandsTab = lazy(() => import("./BandsTab"));
const FinancialReports = lazy(() => import("./FinancialReports"));
const CalendarView = lazy(() => import("./CalendarView"));
const SetlistsTab = lazy(() => import("./SetlistsTab"));
const SongsTab = lazy(() => import("./SongsTab"));
const SharedLinksTab = lazy(() => import("./SharedLinksTab"));
const SuperAdminTab = lazy(() => import("./SuperAdminTab"));
import RouteProgressBar from "./RouteProgressBar";

type DashboardTab =
  | "gigs"
  | "all-gigs"
  | "analytics"
  | "investments"
  | "songs"
  | "bands"
  | "band-members"
  | "calendar"
  | "setlists"
  | "shared-links"
  | "superadmin";

const DASHBOARD_TABS: DashboardTab[] = [
  "gigs",
  "all-gigs",
  "analytics",
  "investments",
  "songs",
  "bands",
  "band-members",
  "calendar",
  "setlists",
  "shared-links",
  "superadmin",
];

const isDashboardTab = (value: string | null): value is DashboardTab => {
  return value !== null && DASHBOARD_TABS.includes(value as DashboardTab);
};

const TAB_PRELOADERS: Partial<Record<DashboardTab, () => Promise<unknown>>> = {
  "all-gigs": () => import("./AllGigsTab"),
  analytics: () => Promise.all([import("./AnalyticsPage"), import("./AIPredictionsTab"), import("./FinancialReports")]),
  investments: () => import("./InvestmentsTab"),

  songs: () => import("./SongsTab"),
  bands: () => import("./BandsTab"),
  "band-members": () => import("./BandMembers"),
  calendar: () => import("./CalendarView"),
  setlists: () => import("./SetlistsTab"),
  "shared-links": () => import("./SharedLinksTab"),
  superadmin: () => import("./SuperAdminTab"),
};

const getTabLabels = (t: (key: string) => string): Record<DashboardTab, string> => ({
  gigs: t('dashboard.overview'),
  "all-gigs": t('dashboard.allGigs'),
  analytics: t('dashboard.insights'),
  investments: t('dashboard.investments'),
  songs: t('dashboard.songs'),
  bands: t('dashboard.bands'),
  "band-members": t('dashboard.bandMembers'),
  calendar: t('dashboard.calendar'),
  setlists: t('dashboard.setlists'),
  "shared-links": t('dashboard.share'),
  superadmin: t('dashboard.superadmin'),
});

const getPrimaryNavTabs = (settings: UserSettingsData): DashboardTab[] => {
  // Hardened: validate against the known tab list, drop invalid values and
  // de-duplicate, so a corrupt / foreign customTab1 or customTab2 in the DB
  // can never render an unknown tab (undefined label, blank main area) or
  // two identical primary nav buttons (React duplicate keys).
  const isValidTab = (value: string | undefined): value is DashboardTab =>
    typeof value === "string" && DASHBOARD_TABS.includes(value as DashboardTab) && value !== "gigs";
  const custom1 = isValidTab(settings.customTab1) ? settings.customTab1 : "setlists";
  const custom2 = isValidTab(settings.customTab2) ? settings.customTab2 : "songs";
  const nav: DashboardTab[] = ["gigs", custom1];
  if (custom2 !== custom1) {
    nav.push(custom2);
  } else {
    // Collision fallback: keep three unique tabs in the primary nav.
    nav.push(custom1 === "setlists" ? "songs" : "setlists");
  }
  return nav;
};

const WORKSPACE_NAV_TABS: DashboardTab[] = ["bands", "band-members", "shared-links", "analytics", "investments", "superadmin", "calendar", "setlists", "songs", "all-gigs"];
const SECONDARY_NAV_TABS: DashboardTab[] = ["all-gigs", "band-members", "shared-links", "analytics", "investments", "superadmin"];

const renderTabIcon = (tab: DashboardTab, className = "h-4 w-4") => {
  switch (tab) {
    case "gigs":
      return <Icons.GridView className={className} />;
    case "all-gigs":
      return <Icons.ListView className={className} />;
    case "analytics":
      return <Icons.Analytics className={className} />;
    case "investments":
      return <Icons.Wallet className={className} />;
    case "songs":
      return <Icons.Music2 className={className} />;
    case "bands":
      return <Icons.People className={className} />;
    case "band-members":
      return <Icons.People className={className} />;
    case "calendar":
      return <Icons.Calendar className={className} />;
    case "setlists":
      return <Icons.ListView className={className} />;
    case "shared-links":
      return <Icons.Link className={className} />;
    case "superadmin":
      return <Icons.Settings className={className} />;
    default:
      return <Icons.GridView className={className} />;
  }
};

const TabLoader = ({ message }: { message: string }) => (
  <LoadingSpinner size="lg" message={message} />
);

const OverviewKpiSkeleton = () => (
  <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/50">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`overview-skeleton-${index}`}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-32 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={`overview-skeleton-detail-${index}`}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-28 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-5/6 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

async function parseApiError(res: Response): Promise<string> {
  const bodyText = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as { error?: string; details?: string };
      return parsed.error || parsed.details || `HTTP ${res.status}`;
    } catch {
      return bodyText || `HTTP ${res.status}`;
    }
  }

  if (contentType.includes("text/html") || bodyText.includes("<!DOCTYPE html")) {
    return "Server error while loading data. Please refresh and try again.";
  }

  return bodyText || `HTTP ${res.status}`;
}

/**
 * Compact Overview row: high-density, streamlined list layout for quick
 * scanning of upcoming / handled performances in the Overview tab.
 */
const OverviewCompactRow = ({
  gig,
  onEdit,
  isHandled,
}: {
  gig: Gig;
  onEdit: (gig: Gig) => void;
  isHandled?: boolean;
}) => {
  const gigDate = new Date(gig.date);
  const dateLabel = gigDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const statusBadge = isHandled
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : gig.isTentative
      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300";
  const statusText = isHandled
    ? "Handled"
    : gig.isTentative
      ? "Tentative"
      : "Active";

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm hover:border-slate-300 hover:shadow-md transition dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-slate-600"
    >
      {/* Date */}
      <div className="min-w-[92px] text-sm font-medium text-slate-700 dark:text-slate-200">
        {dateLabel}
      </div>
      {/* Venue / name */}
      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
        {gig.eventName}
      </div>
      {/* Performers/venue sub-label */}
      <div className="hidden md:flex min-w-0 max-w-[180px] truncate text-xs text-slate-500 dark:text-slate-400">
        {gig.performers}
      </div>
      {/* Status badge */}
      <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge}`}>
        {statusText}
      </span>
      {/* Edit */}
      <button
        onClick={() => onEdit(gig)}
        title="Edit performance"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <Icons.Edit className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading: authLoading, signOut, getAccessToken } = useAuth();
  const { settings, updateSettings, fmtCurrency, locale } = useSettings();
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [totalGigCount, setTotalGigCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialAuthCheck, setInitialAuthCheck] = useState(true);
  const [investmentOverview, setInvestmentOverview] = useState({
    totalInvested: 0,
    totalInvestments: 0,
    sharedInvestments: 0,
    loading: true,
  });
  const [showForm, setShowForm] = useState(false);
  const [editGig, setEditGig] = useState<Gig | null>(null);
  const [deleteGig, setDeleteGig] = useState<Gig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const queryTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<DashboardTab>(isDashboardTab(queryTab) ? queryTab : "gigs");
  const [canAccessSuperAdmin, setCanAccessSuperAdmin] = useState(false);
  const [superAdminAccessChecked, setSuperAdminAccessChecked] = useState(false);
  const [insightsView, setInsightsView] = useState<"analytics" | "reports" | "ai-predictions">("analytics");
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const selectedTab = activeTab === "superadmin" && !canAccessSuperAdmin ? "gigs" : activeTab;
  const workspaceTabs = useMemo(
    () => WORKSPACE_NAV_TABS.filter((tab) => tab !== "superadmin" || canAccessSuperAdmin),
    [canAccessSuperAdmin]
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileWorkspace, setShowMobileWorkspace] = useState(true);
  const [globalExpandState, setGlobalExpandState] = useState<boolean | undefined>(undefined);
  const [selectedGigIds, setSelectedGigIds] = useState<Set<string>>(new Set());
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(activeTab === "gigs");
  // Overview view mode: 'grid' (cards) or 'compact' (dense list).
  // Account-bound via settings (overviewViewMode) with a localStorage mirror
  // so the choice survives instant refresh and syncs across devices.
  // Guarded for SSR: localStorage only exists on the client.
  let overviewLocalFallback: "grid" | "compact" = "grid";
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem("gig-manager-overview-view-mode");
      overviewLocalFallback = stored === "compact" ? "compact" : "grid";
    } catch {
      overviewLocalFallback = "grid";
    }
  }
  const [overviewViewMode, setOverviewViewMode] = useState<"grid" | "compact">(
    settings.overviewViewMode === "compact" ? "compact" : overviewLocalFallback
  );
  // Keep in sync if the account settings load in later (e.g. first fetch, or a
  // different device updated the preference).
  useEffect(() => {
    if (settings.overviewViewMode === "compact" || settings.overviewViewMode === "grid") {
      setOverviewViewMode(settings.overviewViewMode);
    }
  }, [settings.overviewViewMode]);
  const handleSetOverviewViewMode = useCallback(
    (mode: "grid" | "compact") => {
      setOverviewViewMode(mode);
      try {
        localStorage.setItem("gig-manager-overview-view-mode", mode);
      } catch (e) {
        console.error("Failed to save overview view mode:", e);
      }
      // Optimistic local update + persist to the account (PUT /api/settings).
      void updateSettings({ overviewViewMode: mode });
    },
    [updateSettings]
  );
  const tabLabels = useMemo(() => getTabLabels(t), [t]);
  const [exportingType, setExportingType] = useState<"gigs" | "summary" | "report" | null>(null);
  const [isActiveSectionExpanded, setIsActiveSectionExpanded] = useState(true);
  const [isHandledSectionExpanded, setIsHandledSectionExpanded] = useState(false);
  const [isWideView, setIsWideView] = useState(false);
  /** Fullscreen layout only applies from lg; mobile is always standard width */
  const [supportsWideLayout, setSupportsWideLayout] = useState(false);
  const effectiveWideView = isWideView && supportsWideLayout;
  const isDutch = locale.startsWith("nl");
  const fetchGigsInFlightRef = useRef(false);
  const fetchInvestmentsInFlightRef = useRef(false);
  const noSessionLoggedRef = useRef(false);
  const gigsRef = useRef<Gig[]>([]);
  const fetchRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchRetryAttemptRef = useRef(0);
  const swRecoveryAttemptedRef = useRef(false);
  const serverErrorBlockedRef = useRef(false);
  const lastBlockedUserIdRef = useRef<string | null>(null);
  const lastFetchTimeRef = useRef(0); // Minimum 500ms between fetches
  const FETCH_THROTTLE_MS = 500;
  const gigsCacheKey = useMemo(
    () => (session?.user?.id ? `gigs-cache:${session.user.id}` : null),
    [session?.user?.id]
  );

  useEffect(() => {
    gigsRef.current = gigs;
  }, [gigs]);

  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (currentUserId !== lastBlockedUserIdRef.current) {
      serverErrorBlockedRef.current = false;
      lastBlockedUserIdRef.current = currentUserId;
      fetchRetryAttemptRef.current = 0;
      if (fetchRetryTimeoutRef.current) {
        clearTimeout(fetchRetryTimeoutRef.current);
        fetchRetryTimeoutRef.current = null;
      }
    }
  }, [session?.user?.id]);

  useEffect(() => {
    return () => {
      if (fetchRetryTimeoutRef.current) {
        clearTimeout(fetchRetryTimeoutRef.current);
      }
    };
  }, []);

  // Track Web Vitals on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // PerformanceObserver for CLS (Cumulative Layout Shift)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ((entry as any).hadRecentInput) continue;
          const delta = (entry as any).value;
          // Rate CLS: good < 0.1, needs improvement < 0.25, else poor
          const clsRating: "good" | "needs improvement" | "poor" =
            delta < 0.1 ? "good" : delta < 0.25 ? "needs improvement" : "poor";
          recordWebVital({
            name: "CLS",
            value: delta,
            rating: clsRating,
            delta: delta,
            id: `cls-${entry.startTime}`,
            navigationType: "navigate",
          });
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      return () => observer.disconnect();
    } catch (e) {
      console.warn("CLS tracking not supported");
    }
  }, []);

  // Track page load time (FCP/LCP proxy)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const pageStart = performance.now();
    const handlePageComplete = () => {
      const pageLoadTime = performance.now() - pageStart;
      if (pageLoadTime > 0) {
        recordMetric("Dashboard Page Load", pageLoadTime, {
          endpoint: "/dashboard",
        });
      }
    };

    const timer = setTimeout(handlePageComplete, 100);
    return () => clearTimeout(timer);
  }, [gigs]);

  // Sync URL query param with activeTab state
  useEffect(() => {
    const queryTab = searchParams.get("tab");
    if (isDashboardTab(queryTab) && queryTab !== activeTab) {
      setActiveTab(queryTab);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    let cancelled = false;

    const checkSuperAdminAccess = async () => {
      if (!session?.user) {
        if (!cancelled) {
          setCanAccessSuperAdmin(false);
          setSuperAdminAccessChecked(true);
        }
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) {
            setCanAccessSuperAdmin(false);
            setSuperAdminAccessChecked(true);
          }
          return;
        }

        const response = await fetch("/api/superadmin/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = response.ok ? await response.json() : null;
        if (!cancelled) {
          setCanAccessSuperAdmin(Boolean(payload?.superAdmin));
          setSuperAdminAccessChecked(true);
        }
      } catch (error) {
        console.debug("Failed to check superadmin access", error);
        if (!cancelled) {
          setCanAccessSuperAdmin(false);
          setSuperAdminAccessChecked(true);
        }
      }
    };

    checkSuperAdminAccess();

    return () => {
      cancelled = true;
    };
  }, [session?.user, getAccessToken]);

  useEffect(() => {
    if (!superAdminAccessChecked) return;

    if (activeTab === "superadmin" && !canAccessSuperAdmin) {
      setActiveTab("gigs");
      router.replace("?tab=gigs", { scroll: false } as any);
    }
  }, [activeTab, canAccessSuperAdmin, superAdminAccessChecked, router]);

  // Scroll to top when tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    // Default behavior per tab:
    // - Overview tab (`gigs`) starts expanded
    // - All other tabs start collapsed
    setIsOverviewExpanded(selectedTab === "gigs");
  }, [selectedTab]);

  useEffect(() => {
    // Hydration-safe localStorage access
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("dashboard-wide-view");
      if (saved !== null) {
        setIsWideView(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load wide view preference:", e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setSupportsWideLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);



  const handleToggleOverview = useCallback(() => {
    setIsOverviewExpanded((prev) => !prev);
  }, []);

  const handleToggleWideView = useCallback(() => {
    setIsWideView((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem("dashboard-wide-view", JSON.stringify(newVal));
      } catch (e) {
        console.error("Failed to save wide view preference:", e);
      }
      return newVal;
    });
  }, []);

  // Show the last known gigs immediately while we fetch fresh data.
  useEffect(() => {
    // Hydration-safe localStorage access
    if (typeof window === "undefined" || !gigsCacheKey) return;
    try {
      const raw = localStorage.getItem(gigsCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data: Gig[]; total: number };
      if (Array.isArray(parsed?.data)) {
        setGigs(parsed.data);
        setTotalGigCount(typeof parsed.total === "number" ? parsed.total : parsed.data.length);
        setLoading(false);
      }
    } catch (error) {
      console.warn("Failed to read gigs cache", error);
    }
  }, [gigsCacheKey]);

  const handleEditGig = useCallback((gig: Gig) => {
    setEditGig(gig);
  }, []);

  const handleEditGigById = useCallback(
    (gigId: string) => {
      const gig = gigs.find((item) => item.id === gigId);
      if (gig) handleEditGig(gig);
    },
    [gigs, handleEditGig]
  );

  const handleTabChange = useCallback(
    (nextTab: DashboardTab) => {
      if (nextTab === activeTab) {
        setShowMobileMenu(false);
        setShowProfileMenu(false);
        return;
      }

      if (nextTab === "superadmin" && !canAccessSuperAdmin) {
        setShowMobileMenu(false);
        setShowProfileMenu(false);
        return;
      }

      TAB_PRELOADERS[nextTab]?.();
      if (nextTab === "analytics") {
        import("./FinancialReports");
      }
      startTransition(() => {
        setActiveTab(nextTab);
        router.push(`?tab=${nextTab}`, { scroll: false } as any);
        setShowMobileMenu(false);
        setShowProfileMenu(false);
      });
    },
    [activeTab, canAccessSuperAdmin, startTransition, router]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const browser = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const preloadLikelyTabs = () => {
      TAB_PRELOADERS.calendar?.();
      TAB_PRELOADERS["all-gigs"]?.();
      TAB_PRELOADERS.analytics?.();
      import("./FinancialReports");
    };

    if (typeof browser.requestIdleCallback === "function") {
      const idleId = browser.requestIdleCallback(preloadLikelyTabs, { timeout: 1500 });
      return () => browser.cancelIdleCallback?.(idleId);
    }

    const timeoutId = setTimeout(preloadLikelyTabs, 1200);
    return () => clearTimeout(timeoutId);
  }, []);

  // -- Data fetching ----------------------------------------------------------

  const fetchGigs = useCallback(async () => {
    if (serverErrorBlockedRef.current) {
      return;
    }

    if (fetchGigsInFlightRef.current) {
      return;
    }

    // Throttle: prevent fetches within 500ms
    const now = Date.now();
    if (now - lastFetchTimeRef.current < FETCH_THROTTLE_MS) {
      return;
    }
    lastFetchTimeRef.current = now;

    // Block data fetching until auth is fully resolved to prevent hydration race condition
    if (authLoading) {
      console.log("[fetchGigs] Auth still loading, deferring fetch...");
      return;
    }

    // Only fetch if we have a valid session
    if (!session?.user) {
      if (!noSessionLoggedRef.current) {
        console.log("[fetchGigs] No user session");
        noSessionLoggedRef.current = true;
      }
      setGigs([]);
      setTotalGigCount(0);
      setLoading(false);
      return;
    }

    noSessionLoggedRef.current = false;

    try {
      fetchGigsInFlightRef.current = true;
      setLoading(gigsRef.current.length === 0);
      console.log("[fetchGigs] Getting access token for user:", session.user.email);
      const token = await getAccessToken();

      if (!token) {
        // Token not available yet — wait a bit and retry
        console.warn("[fetchGigs] No token available, retrying in 500ms...");
        setLoading(false);
        setTimeout(fetchGigs, 500);
        return;
      }

      console.log("[fetchGigs] Got token, fetching gigs...");
      const res = await fetch("/api/gigs", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      console.log("[fetchGigs] Response status:", res.status);

      if (!res.ok) {
        if (res.status === 401) {
          console.warn("[fetchGigs] Got 401, attempting token refresh and retry...");
          // Token might be expired — try to refresh
          const newToken = await getAccessToken();
          if (newToken && newToken !== token) {
            console.log("[fetchGigs] Got new token after refresh, retrying...");
            const retryRes = await fetch("/api/gigs", {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${newToken}`,
                Accept: "application/json",
              },
            });
            if (retryRes.ok) {
              const json = await retryRes.json();
              const nextData = json.data ?? json;
              setGigs(nextData);
              setTotalGigCount(json.total ?? nextData.length);
              if (gigsCacheKey) {
                try {
                  localStorage.setItem(gigsCacheKey, JSON.stringify({
                    data: nextData,
                    total: json.total ?? nextData.length,
                  }));
                } catch (error) {
                  console.warn("Failed to write gigs cache", error);
                }
              }
              console.log("[fetchGigs] Success after retry:", (json.data ?? json).length, "gigs");
              fetchRetryAttemptRef.current = 0;
              return;
            }
          }
          toast.error("Session expired. Please sign out and sign in again.");
        } else if (res.status >= 500 && res.status !== 503) {
          serverErrorBlockedRef.current = true;
          fetchRetryAttemptRef.current = 0;
          if (fetchRetryTimeoutRef.current) {
            clearTimeout(fetchRetryTimeoutRef.current);
            fetchRetryTimeoutRef.current = null;
          }
          const errorText = await parseApiError(res);
          console.error("[fetchGigs] Server error response:", errorText);
          toast.error("Server error while loading gigs. Refresh after the backend is healthy.");
          setGigs(gigsRef.current);
          setTotalGigCount(gigsRef.current.length);
          return;
        } else if (res.status === 503) {
          // Service unavailable - retry with exponential backoff and cap attempts
          console.warn("[fetchGigs] Got 503, handling temporary service outage...");
          const errorText = await res.text();
          const errorObj = (() => { try { return JSON.parse(errorText); } catch { return { error: errorText || 'Service temporarily unavailable' }; } })();
          
          if (errorObj.error === "Offline - cached data unavailable") {
            if (!swRecoveryAttemptedRef.current) {
              swRecoveryAttemptedRef.current = true;
              console.warn("[fetchGigs] Old Service Worker detected. Unregistering and reloading once...");
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                  await reg.unregister();
                }
              }
              window.location.reload();
              return;
            }
          }

          fetchRetryAttemptRef.current += 1;
          const attempt = fetchRetryAttemptRef.current;
          const maxRetries = 5;
          const retryDelayMs = Math.min(1000 * 2 ** (attempt - 1), 30000);
          const hasCachedData = gigsRef.current.length > 0;

          if (attempt > maxRetries) {
            toast.error(errorObj.error || "Service tijdelijk niet beschikbaar.");
            return;
          }

          toast.error(
            hasCachedData
              ? `${errorObj.error || "Service tijdelijk niet beschikbaar"}. We tonen je laatst geladen data en proberen opnieuw...`
              : `${errorObj.error || "Service tijdelijk niet beschikbaar"}. Opnieuw proberen (${attempt}/${maxRetries})...`
          );

          if (fetchRetryTimeoutRef.current) {
            clearTimeout(fetchRetryTimeoutRef.current);
          }
          fetchRetryTimeoutRef.current = setTimeout(() => {
            fetchGigs();
          }, retryDelayMs);
          return;
        } else {
            const errorText = await parseApiError(res);
            console.error("[fetchGigs] Error response:", errorText);
            const short = errorText ? String(errorText).slice(0, 200) : res.statusText || String(res.status);
            const containsOfflineCacheMessage =
              short.includes("Offline - cached data unavailable") ||
              short.includes("Unable to load data. Please check your connection and try again.");

            if (containsOfflineCacheMessage) {
              toast.error("Service tijdelijk niet beschikbaar. Probeer het zo opnieuw.");
            } else {
              toast.error(`Failed to load gigs (${res.status}): ${short}`);
            }
          }
        setGigs([]);
        setTotalGigCount(0);
      } else {
        const json = await res.json();
        console.log("[fetchGigs] Success:", json.total || (json.data ?? json).length, "gigs");
        const nextData = json.data ?? json;
        setGigs(nextData);
        setTotalGigCount(json.total ?? nextData.length);
        fetchRetryAttemptRef.current = 0;
        if (gigsCacheKey) {
          try {
            localStorage.setItem(gigsCacheKey, JSON.stringify({
              data: nextData,
              total: json.total ?? nextData.length,
            }));
          } catch (error) {
            console.warn("Failed to write gigs cache", error);
          }
        }
      }
    } catch (err) {
      console.error("Fetch gigs error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("500") || msg.toLowerCase().includes("internal server error")) {
        serverErrorBlockedRef.current = true;
      }
      toast.error(`Failed to load gigs: ${msg}`);
    } finally {
      fetchGigsInFlightRef.current = false;
      setLoading(false);
    }
  }, [session?.user, getAccessToken, gigsCacheKey, toast, authLoading]);

  const fetchInvestmentOverview = useCallback(async () => {
    if (fetchInvestmentsInFlightRef.current) {
      return;
    }

    // Block data fetching until auth is fully resolved to prevent hydration race condition
    if (authLoading) {
      console.log("[fetchInvestmentOverview] Auth still loading, deferring fetch...");
      return;
    }

    // Only fetch if we have a valid session
    if (!session?.user) {
      setInvestmentOverview({
        totalInvested: 0,
        totalInvestments: 0,
        sharedInvestments: 0,
        loading: false,
      });
      return;
    }

    try {
      fetchInvestmentsInFlightRef.current = true;
      setInvestmentOverview((prev) => ({ ...prev, loading: true }));

      const token = await getAccessToken();
      if (!token) {
        setInvestmentOverview((prev) => ({ ...prev, loading: false }));
        return;
      }

      const response = await fetch("/api/investments", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        setInvestmentOverview((prev) => ({ ...prev, loading: false }));
        return;
      }

      const payload = await response.json();
      const investments = Array.isArray(payload) ? payload : [];
      const totalInvested = investments.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
      const sharedInvestments = investments.filter((item) => Boolean(item?.sharedWithMusician)).length;

      setInvestmentOverview({
        totalInvested,
        totalInvestments: investments.length,
        sharedInvestments,
        loading: false,
      });
    } catch (error) {
      console.error("[fetchInvestmentOverview] Error:", error);
      setInvestmentOverview((prev) => ({ ...prev, loading: false }));
    } finally {
      fetchInvestmentsInFlightRef.current = false;
    }
  }, [session?.user, getAccessToken, authLoading]);

  useEffect(() => {
    // Only fetch data when auth is resolved
    if (!authLoading) {
      fetchGigs();
    }
  }, [fetchGigs, authLoading]);

  useEffect(() => {
    // Only fetch data when auth is resolved
    if (!authLoading) {
      fetchInvestmentOverview();
    }
  }, [fetchInvestmentOverview, authLoading]);

  // Mark initial auth check as complete after first render
  useEffect(() => {
    setInitialAuthCheck(false);
  }, []);

  // Fail-safe: a hard refresh (Ctrl+Shift+R / Ctrl+Shift+F5) can stall the auth
  // evaluation or Service Worker cache revalidation, leaving the UI on an
  // endless loading state. After a strict timeout, force the application shell
  // (or the login view) to render instead of hanging on the loading spinner.
  const LOADING_FAILSAFE_MS = 3_500;
  const authLoadingRef = useRef(authLoading);
  useEffect(() => {
    authLoadingRef.current = authLoading;
  }, [authLoading]);

  useEffect(() => {
    const failsafeTimer = setTimeout(() => {
      setInitialAuthCheck(false);
      if (authLoadingRef.current) {
        console.warn(
          `[Dashboard] Auth still pending after ${LOADING_FAILSAFE_MS}ms; forcing shell render (fail-safe)`
        );
        setLoading(false);
      }
    }, LOADING_FAILSAFE_MS);
    return () => clearTimeout(failsafeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter gigs based on search query
  const filteredGigs = useMemo(() => {
    if (!deferredSearchQuery.trim()) return gigs;
    const query = deferredSearchQuery.toLowerCase();
    return gigs.filter((gig) =>
      gig.eventName.toLowerCase().includes(query) ||
      gig.performers.toLowerCase().includes(query) ||
      (gig.notes && gig.notes.toLowerCase().includes(query)) ||
      (gig.performanceLineup && gig.performanceLineup.toLowerCase().includes(query))
    );
  }, [gigs, deferredSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setShowWorkspaceMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -- CRUD handlers ----------------------------------------------------------

  const handleCreate = async (data: GigFormData) => {
    try {
      const token = await getAccessToken();

      if (!token) {
        toast.error("Could not get session. Please sign out and sign in again.");
        return;
      }

      const res = await fetch("/api/gigs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          paymentReceivedDate: data.paymentReceivedDate || null,
          bandPaidDate: data.bandPaidDate || null,
          notes: data.notes || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create gig");
      }

      setShowForm(false);
      toast.success("Performance added successfully!");
      fetchGigs();
    } catch (err: any) {
      toast.error(err.message || "Failed to create performance. Please try again.");
    }
  };

  const handleUpdate = async (data: GigFormData) => {
    if (!editGig) return;
    try {
      const token = await getAccessToken();

      if (!token) {
        toast.error("Could not get session. Please sign out and sign in again.");
        return;
      }

      const res = await fetch(`/api/gigs/${editGig.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          paymentReceivedDate: data.paymentReceivedDate || null,
          bandPaidDate: data.bandPaidDate || null,
          notes: data.notes || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update gig");
      }

      setEditGig(null);
      toast.success("Performance updated successfully!");
      fetchGigs();
    } catch (err: any) {
      toast.error(err.message || "Failed to update performance. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!deleteGig) return;
    const deletedName = deleteGig.eventName;
    // Optimistic: remove from UI immediately
    const prev = gigs;
    setGigs((g) => g.filter((x) => x.id !== deleteGig.id));
    setDeleteGig(null);
    try {
      const token = await getAccessToken();

      if (!token) {
        setGigs(prev);
        toast.error("Could not get session. Please sign out and sign in again.");
        return;
      }

      const res = await fetch(`/api/gigs/${deleteGig.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error();
      toast.success(`Performance "${deletedName}" deleted successfully.`, {
        label: "Undo",
        onClick: () => {
          setGigs(prev);
          toast.info("Deletion cancelled - performance restored.");
        }
      });
      fetchGigs(); // re-sync
    } catch {
      setGigs(prev); // rollback on failure
      toast.error("Delete failed — performance restored.");
    }
  };

  const handleDuplicateGig = useCallback(
    async (gig: Gig) => {
      try {
        const token = await getAccessToken();
        if (!token) {
          toast.error("Could not get session. Please sign out and sign in again.");
          return;
        }

        const res = await fetch("/api/gigs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            eventName: `${gig.eventName} (Copy)`,
            date: gig.date ? gig.date.split("T")[0] : "",
            performers: gig.performers,
            numberOfMusicians: gig.numberOfMusicians,
            performanceLineup: gig.performanceLineup || "",
            managerPerforms: gig.managerPerforms,
            isCharity: gig.isCharity,
            isTentative: gig.isTentative,
            performanceFee: gig.performanceFee,
            performanceFeeUnknown: gig.performanceFeeUnknown,
            technicalFee: gig.technicalFee,
            managerBonusType: gig.managerBonusType,
            managerBonusAmount: gig.managerBonusAmount,
            performanceDistribution: gig.performanceDistribution,
            managerPerformanceAmount: gig.managerPerformanceAmount,
            claimPerformanceFee: gig.claimPerformanceFee,
            claimTechnicalFee: gig.claimTechnicalFee,
            technicalFeeClaimAmount: gig.technicalFeeClaimAmount,
            managerHandlesDistribution: gig.managerHandlesDistribution,
            advanceReceivedByManager: gig.advanceReceivedByManager,
            advanceToMusicians: gig.advanceToMusicians,
            paymentReceived: false,
            paymentReceivedDate: null,
            managerInstantPayment: gig.managerInstantPayment,
            bandPaid: false,
            bandPaidDate: null,
            bookingDate: new Date().toISOString().split("T")[0],
            notes: gig.notes || null,
            bandId: gig.bandId || null,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to duplicate gig");
        }

        toast.success(t("gigs.duplicateSuccess", "Performance duplicated successfully!"));
        await fetchGigs();
      } catch (err: any) {
        toast.error(err.message || "Failed to duplicate gig");
      }
    },
    [getAccessToken, fetchGigs, t, toast]
  );

  const handleExpandAll = () => {
    setGlobalExpandState(true);
    toast.info("Expanded all performances");
  };

  const handleCollapseAll = () => {
    setGlobalExpandState(false);
    toast.info("Collapsed all performances");
  };

  const getDownloadFilename = (
    contentDisposition: string | null,
    fallbackType: "gigs" | "summary" | "report",
    fallbackFormat: "csv" | "json"
  ) => {
    const utf8Match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
    const quotedMatch = contentDisposition?.match(/filename="?([^";]+)"?/i);
    const rawName = utf8Match?.[1] || quotedMatch?.[1];

    if (rawName) {
      try {
        return decodeURIComponent(rawName);
      } catch {
        return rawName;
      }
    }

    const datePart = new Date().toISOString().split("T")[0];
    return `${fallbackType}-${datePart}.${fallbackFormat}`;
  };

  const handleExport = async (type: "gigs" | "summary" | "report") => {
    if (exportingType) return;

    setExportingType(type);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error("Could not get session. Please sign out and sign in again.");
        return;
      }

      const format = type === "report" ? "json" : "csv";
      const typeLabel = type === "gigs" ? "Gig export" : type === "summary" ? "Summary export" : "Report export";
      const responsePromise = fetch(`/api/exports/summary?type=${type}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.info(`Generating ${typeLabel.toLowerCase()}...`);
      const response = await responsePromise;

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const filename = getDownloadFilename(response.headers.get("Content-Disposition"), type, format);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${typeLabel} downloaded.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Export failed";
      console.error("[handleExport]", msg);
      toast.error(msg);
    } finally {
      setExportingType(null);
    }
  };

  const handleToggleGigSelection = (gigId: string) => {
    const newSelected = new Set(selectedGigIds);
    if (newSelected.has(gigId)) {
      newSelected.delete(gigId);
    } else {
      newSelected.add(gigId);
    }
    setSelectedGigIds(newSelected);
  };

  const handleSelectAll = () => {
    if (gigs.length > 0) {
      const allIds = new Set(gigs.map((g) => g.id));
      setSelectedGigIds(allIds);
      toast.success(`Selected all ${gigs.length} performances`);
    }
  };

  const handleClearSelection = () => {
    setSelectedGigIds(new Set());
    toast.info("Selection cleared");
  };

  // Keyboard shortcuts
  const shortcuts = [
    {
      keys: ["n"],
      description: "New performance",
      action: () => setShowForm(true),
    },
  ];

  // -- Summary calculation ----------------------------------------------------

  const summary: DashboardSummary = useMemo(
    () => {
      const result = summarizeDashboardFinancials(gigs);

      console.log("[Dashboard] Summary calculation complete:", {
        totalEarnings: result.totalEarnings,
        totalEarningsReceived: result.totalEarningsReceived,
        totalEarningsPending: result.totalEarningsPending,
        gigsCount: result.totalGigs,
      });

      return result;
    },
    [gigs]
  );

  const { activeGigs, handledGigs } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = filteredGigs
      .filter((gig) => {
        const gigDate = new Date(gig.date);
        gigDate.setHours(0, 0, 0, 0);
        const isUpcoming = gigDate >= today;
        const isUnpaid = !gig.paymentReceived || !gig.bandPaid;
        return isUpcoming || isUnpaid;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const handled = filteredGigs
      .filter((gig) => {
        const gigDate = new Date(gig.date);
        gigDate.setHours(0, 0, 0, 0);
        const isPast = gigDate < today;
        const isFullyPaid = gig.paymentReceived && gig.bandPaid;
        return isPast && isFullyPaid;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { activeGigs: active, handledGigs: handled };
  }, [filteredGigs]);

  // -- Render -----------------------------------------------------------------

  // Show login if not authenticated (but render immediately, don't block)
  if (!session?.user) {
    return <LandingPage />;
  }

  // Render dashboard immediately - don't block on loading states
  return (
    <div className="min-h-screen bg-transparent transition-colors">
      <RouteProgressBar isLoading={loading || isPending} />
      {/* -- Navbar -------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/40 dark:border-slate-700/40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl dark:backdrop-blur-xl shadow-md dark:shadow-lg transition-colors">
        <div className={`mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:flex-nowrap sm:px-4 sm:py-3 lg:px-6 ${effectiveWideView ? "max-w-none 2xl:px-8" : "max-w-[1800px]"}`}>
          {/* Left: Logo */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => handleTabChange("gigs")}
              className="flex items-center gap-1.5 sm:gap-2.5 hover:opacity-80 transition"
              title="Go to Overview"
            >
              <Image
                src="/favicon.png"
                alt="GigsManager"
                width={36}
                height={36}
                className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 rounded-lg"
              />
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                Gigs<span className="text-gold-600 dark:text-gold-400">Manager</span>
              </h1>
            </button>
            {!isOnline && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/40 dark:text-amber-400 sm:inline-flex"
                title={t('dashboard.offlineBadgeTitle', 'No connection: repertoire is loaded from local storage')}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                {t('dashboard.offlineBadge', 'Offline — local setlists')}
              </span>
            )}
          </div>

          {/* Center: Primary navigation + search */}
          <div className="hidden lg:flex min-w-0 items-center gap-3 flex-1 px-2">
            <nav data-testid="desktop-navigation" className="flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-800/40">
              {getPrimaryNavTabs(settings).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
                    selectedTab === tab
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/70 dark:hover:text-white"
                  }`}
                >
                  {renderTabIcon(tab)}
                  <span>{tabLabels[tab]}</span>
                </button>
              ))}

              <div className="relative" ref={workspaceMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowWorkspaceMenu((open) => !open)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
                    workspaceTabs.includes(selectedTab) && !getPrimaryNavTabs(settings).includes(selectedTab)
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/70 dark:hover:text-white"
                  }`}
                >
                  {workspaceTabs.includes(selectedTab) && !getPrimaryNavTabs(settings).includes(selectedTab) ? (
                    <>
                      {renderTabIcon(selectedTab)}
                      <span>{tabLabels[selectedTab]}</span>
                    </>
                  ) : (
                    <>
                      <Icons.People className="h-4 w-4" />
                      <span>{t('settings.workspace', 'Workspace')}</span>
                    </>
                  )}
                  <Icons.ChevronDown className={`h-4 w-4 transition-transform ${showWorkspaceMenu ? "rotate-180" : ""}`} />
                </button>

                {showWorkspaceMenu && (
                  <div className="absolute left-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200/60 bg-white/95 p-1.5 text-xs shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95 menu-enter">
                    <div className="space-y-0.5">
                      {workspaceTabs.map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setShowWorkspaceMenu(false);
                            handleTabChange(tab);
                          }}
                          className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                            selectedTab === tab
                              ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                              : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                        >
                          {renderTabIcon(tab, "h-3.5 w-3.5")}
                          <span className="font-medium">{tabLabels[tab]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </nav>
            <div className="min-w-0 flex-1 max-w-md">
              <div className="relative">
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search gigs..."
                  className="w-full rounded-full border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-10 text-sm backdrop-blur focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:focus:bg-slate-900 transition duration-200"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                    title="Clear search"
                  >
                    <Icons.Close className="h-4 w-4 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="hidden md:block lg:hidden flex-1 max-w-md mx-4">
            <div className="relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search gigs..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50/50 backdrop-blur focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800/50 dark:backdrop-blur dark:focus:bg-slate-900 dark:text-slate-100 transition duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                  title="Clear search"
                >
                  <Icons.Close className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Add + current secondary section + profile */}
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2 md:gap-3 sm:ml-0">
            {/* Add Performance - icon only on mobile, button on desktop */}
            <button
              onClick={() => {
                setEditGig(null);
                setShowForm(true);
              }}
              className="min-w-0 flex-shrink-0 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 p-1.5 text-white shadow-md transition duration-200 hover:from-brand-700 hover:to-brand-800 hover:shadow-lg active:shadow-inner sm:p-0 sm:px-3 sm:py-2"
              title="Add Performance"
            >
              <Icons.Plus className="h-4 w-4 sm:hidden shrink-0" />
              <span className="hidden sm:inline-flex items-center gap-1 text-sm font-medium">
                <Icons.Plus className="h-4 w-4 shrink-0" />
                Add
              </span>
            </button>

            {/* Profile menu (merged with settings & sign out) */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu((open) => !open)}
                title="Profile & Settings"
                className="flex-shrink-0 rounded-full shadow-md transition duration-200 hover:shadow-lg"
              >
                <Avatar
                  src={session.user?.user_metadata?.avatar_url}
                  name={session.user?.user_metadata?.name}
                  email={session.user?.email}
                  size="md"
                  priority
                />
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200/50 bg-white/95 text-sm shadow-2xl backdrop-blur dark:border-slate-700/50 dark:bg-slate-900/95 dark:backdrop-blur menu-enter">
                  {/* Profile info header */}
                  <div className="border-b border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={session.user?.user_metadata?.avatar_url}
                        name={session.user?.user_metadata?.name}
                        email={session.user?.email}
                        size="lg"
                        priority
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {session.user?.user_metadata?.name || t('settings.profileFallback')}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          {session.user?.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Menu items */}
                  <div className="py-2">
                    <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      Profile
                    </div>
                    <div className="grid gap-1 px-2">
                      <button
                        onClick={() => {
                          setShowSettings(true);
                          setShowProfileMenu(false);
                        }}
                        className="flex min-h-[44px] w-full items-center rounded-xl px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icons.Settings className="h-4 w-4" />
                          Settings
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          handleToggleWideView();
                          setShowProfileMenu(false);
                        }}
                        className="flex min-h-[44px] w-full items-center rounded-xl px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icons.Expand className="h-4 w-4" />
                          {isWideView ? "Standard layout" : "Fullscreen layout"}
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setShowKeyboardShortcuts(true);
                          setShowProfileMenu(false);
                        }}
                        className="flex min-h-[44px] w-full items-center rounded-xl px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icons.Keyboard className="h-4 w-4" />
                          Keyboard shortcuts
                        </span>
                      </button>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2">
                      <button
                        onClick={async () => {
                          setShowProfileMenu(false);
                          await signOut();
                        }}
                        className="flex min-h-[44px] w-full items-center px-3 py-2.5 text-left text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile/tablet: current section indicator */}
        <div className="lg:hidden border-t border-slate-200/40 dark:border-slate-700/40">
          <button
            data-testid="mobile-menu-button"
            type="button"
            onClick={() => setShowMobileMenu(true)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 min-h-[44px] text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            aria-label="Open navigation menu"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {tabLabels[selectedTab]}
              </span>
            </span>
            <Icons.ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay - OUTSIDE header for full viewport coverage */}
      {showMobileMenu && (
        <>
          <div data-testid="mobile-menu-overlay" className="lg:hidden fixed inset-0 z-[100] bg-black/50 mobile-menu-backdrop" onClick={() => setShowMobileMenu(false)} />
          {/* Responsive menu width: phone (84vw) → tablet (60vw) → large tablet (50vw) */}
          <div className="lg:hidden fixed left-0 top-0 bottom-0 z-[101] w-[84vw] max-w-[19rem] tablet:w-[60vw] tablet:max-w-[30rem] tablet-lg:w-[50vw] tablet-lg:max-w-[40rem] bg-white dark:bg-slate-900 shadow-xl overflow-y-auto mobile-menu-enter">
            <div className="p-4 tablet:p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Menu</h2>
                <button
                  data-testid="close-mobile-menu"
                  onClick={() => setShowMobileMenu(false)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  aria-label="Close menu"
                >
                  <Icons.Close className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Action buttons - grid on small, flex on tablet */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setEditGig(null);
                    setShowForm(true);
                  }}
                  className="inline-flex items-center justify-center gap-1 tablet:gap-2 rounded-xl bg-brand-600 px-2 tablet:px-3 py-2.5 min-h-[44px] text-xs tablet:text-sm font-medium text-white transition hover:bg-brand-700 shadow-sm"
                >
                  <Icons.Plus className="h-4 w-4 shrink-0" />
                  <span className="hidden tablet:inline">Add gig</span>
                  <span className="tablet:hidden">Add</span>
                </button>
                <button
                  onClick={() => {
                      setShowMobileMenu(false);
                      handleTabChange("setlists");
                    }}
                  className="inline-flex items-center justify-center gap-1 tablet:gap-2 rounded-xl border border-slate-200 bg-white px-2 tablet:px-3 py-2.5 min-h-[44px] text-xs tablet:text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 shadow-sm"
                >
                  <Icons.ListView className="h-4 w-4 shrink-0" />
                  <span className="hidden tablet:inline">Setlists</span>
                  <span className="tablet:hidden">Setlists</span>
                </button>
              </div>
              
              {/* Mobile search - visible on phones, hidden on tablets (search in header) */}
              <div className="mb-4 tablet:hidden">
                <div className="relative">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search gigs..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                    >
                    </button>
                  )}
                </div>
              </div>



              {/* Navigation */}
              <nav className="space-y-4">
                {/* 1. Primary Home/Overview */}
                <div>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      handleTabChange("gigs");
                    }}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                      selectedTab === "gigs"
                        ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icons.GridView className={`h-5 w-5 shrink-0 ${selectedTab === "gigs" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                      <span>{tabLabels.gigs}</span>
                    </div>
                    {selectedTab === "gigs" && (
                      <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                    )}
                  </button>
                </div>

                {/* 2. Primary User Shortcuts (Custom Tabs from Settings) */}
                <div className="space-y-1">
                  <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('dashboard.shortcuts', 'Shortcuts')}
                  </div>
                  {getPrimaryNavTabs(settings).slice(1).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setShowMobileMenu(false);
                        handleTabChange(tab);
                      }}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                        selectedTab === tab
                          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {renderTabIcon(tab, "h-5 w-5")}
                        <span>{tabLabels[tab]}</span>
                      </div>
                      {selectedTab === tab && (
                        <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                {/* 3. Gigs / Calendar */}
                <div className="space-y-1">
                  <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('dashboard.gigsAndSchedule', 'Gigs & Calendar')}
                  </div>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      handleTabChange("all-gigs");
                    }}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                      selectedTab === "all-gigs"
                        ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icons.ListView className={`h-5 w-5 shrink-0 ${selectedTab === "all-gigs" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                      <span>{tabLabels["all-gigs"]}</span>
                    </div>
                    {selectedTab === "all-gigs" && (
                      <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      handleTabChange("calendar");
                    }}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                      selectedTab === "calendar"
                        ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icons.Calendar className={`h-5 w-5 shrink-0 ${selectedTab === "calendar" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                      <span>{tabLabels.calendar}</span>
                    </div>
                    {selectedTab === "calendar" && (
                      <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                    )}
                  </button>
                </div>

                {/* 4. Workspace dropdown menu */}
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setShowMobileWorkspace((prev) => !prev)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                    aria-expanded={showMobileWorkspace}
                  >
                    <span>{t('dashboard.workspace', 'Workspace')}</span>
                    <Icons.ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showMobileWorkspace ? "rotate-180" : ""}`} />
                  </button>

                  {showMobileWorkspace && (
                    <div className="space-y-1 pl-1">
                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          handleTabChange("band-members");
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                          selectedTab === "band-members"
                            ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icons.People className={`h-5 w-5 shrink-0 ${selectedTab === "band-members" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          <span>{tabLabels["band-members"]}</span>
                        </div>
                        {selectedTab === "band-members" && (
                          <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          handleTabChange("analytics");
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                          selectedTab === "analytics"
                            ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icons.Analytics className={`h-5 w-5 shrink-0 ${selectedTab === "analytics" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          <span>{tabLabels.analytics}</span>
                        </div>
                        {selectedTab === "analytics" && (
                          <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          handleTabChange("investments");
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                          selectedTab === "investments"
                            ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icons.Wallet className={`h-5 w-5 shrink-0 ${selectedTab === "investments" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          <span>{tabLabels.investments}</span>
                        </div>
                        {selectedTab === "investments" && (
                          <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          handleTabChange("bands");
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                          selectedTab === "bands"
                            ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icons.People className={`h-5 w-5 shrink-0 ${selectedTab === "bands" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          <span>{tabLabels.bands}</span>
                        </div>
                        {selectedTab === "bands" && (
                          <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          handleTabChange("shared-links");
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                          selectedTab === "shared-links"
                            ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500 font-semibold"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icons.Link className={`h-5 w-5 shrink-0 ${selectedTab === "shared-links" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                          <span>{tabLabels["shared-links"]}</span>
                        </div>
                        {selectedTab === "shared-links" && (
                          <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          setShowSettings(true);
                        }}
                        className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <div className="flex items-center gap-3">
                          <Icons.Settings className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
                          <span>{t('settings.title', 'Settings')}</span>
                        </div>
                      </button>

                      {canAccessSuperAdmin && (
                        <button
                          onClick={() => {
                            setShowMobileMenu(false);
                            handleTabChange("superadmin");
                          }}
                          className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 min-h-[44px] text-sm font-medium transition active:scale-[0.98] ${
                            selectedTab === "superadmin"
                              ? "bg-fuchsia-600 text-white shadow-sm dark:bg-fuchsia-500 font-semibold"
                              : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icons.Settings className={`h-5 w-5 shrink-0 ${selectedTab === "superadmin" ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                            <span>{tabLabels.superadmin}</span>
                          </div>
                          {selectedTab === "superadmin" && (
                            <span className="h-2 w-2 rounded-full bg-white shadow-sm shrink-0" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </nav>
            </div>
          </div>
        </>
      )}

      <main className={`mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-8 min-h-screen pb-safe transition-colors ${effectiveWideView ? "max-w-none 2xl:px-10" : "max-w-[1800px]"}`}>
        {/* Search results indicator */}
        {searchQuery && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-2 text-sm dark:bg-brand-950/30">
            <span className="text-brand-700 dark:text-brand-300">
              Found {filteredGigs.length} {filteredGigs.length === 1 ? 'gig' : 'gigs'} matching "{searchQuery}"
            </span>
            <button
              onClick={() => setSearchQuery("")}
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium"
            >
              Clear
            </button>
          </div>
        )}
        {/* -- Premium Summary Cards ----------------------------------- */}
        {activeTab !== "songs" && (
        <div className="mb-4 sm:mb-8">
          {/* Overview collapse header with export actions */}
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Overview</h2>
            <div className="flex items-center gap-1.5">
              {/* Export buttons */}
              <button
                onClick={() => handleExport("gigs")}
                disabled={Boolean(exportingType)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                title="Export all gigs as CSV"
              >
                {exportingType === "gigs" ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.Download className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={() => handleExport("summary")}
                disabled={Boolean(exportingType)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                title="Export financial summary as CSV"
              >
                {exportingType === "summary" ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.ChartLine className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Summary</span>
              </button>
              <button
                onClick={() => handleExport("report")}
                disabled={Boolean(exportingType)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                title="Export financial report as JSON"
              >
                {exportingType === "report" ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.Document className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Report</span>
              </button>
              {/* View mode toggle: Card Grid vs Compact List */}
              <div
                className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 ml-1"
                role="group"
                aria-label="Overview view"
              >
                <button
                  onClick={() => handleSetOverviewViewMode("grid")}
                  className={`rounded-md p-1.5 transition ${
                    overviewViewMode === "grid"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                  title="Card grid view"
                  aria-pressed={overviewViewMode === "grid"}
                >
                  <Icons.GridView className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleSetOverviewViewMode("compact")}
                  className={`rounded-md p-1.5 transition ${
                    overviewViewMode === "compact"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                  title="Compact list view"
                  aria-pressed={overviewViewMode === "compact"}
                >
                  <Icons.ListView className="h-4 w-4" />
                </button>
              </div>
              {/* Collapse/expand toggle */}
              <button
                onClick={handleToggleOverview}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
                title={isOverviewExpanded ? "Collapse overview" : "Expand overview"}
              >
                <Icons.ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOverviewExpanded ? "rotate-0" : "-rotate-90"}`} />
              </button>
            </div>
          </div>
          {/* Collapsible content */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isOverviewExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {loading && gigs.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <LoadingSpinner size="md" message="Loading overview..." />
                    <div className="hidden sm:block space-y-1">
                      <div className="h-4 w-44 rounded-full bg-slate-200/70 dark:bg-slate-700/70" />
                      <div className="h-3 w-72 rounded-full bg-slate-200/60 dark:bg-slate-700/60" />
                    </div>
                  </div>
                </div>
                <OverviewKpiSkeleton />
              </div>
            ) : (
              <DashboardSummaryComponent
                summary={summary}
                gigs={gigs}
                fmtCurrency={fmtCurrency}
                investmentOverview={investmentOverview}
              />
            )}
          </div>
        </div>
        )}

        {/* -- Content -------------------------------------------------- */}
        {selectedTab === "gigs" ? (
          <>
            {/* -- Overview: Smart sorted performances ---------------------- */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner size="lg" message="Loading performances..." />
              </div>
            ) : filteredGigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-20 text-center">
                <Icons.Music2 className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  {searchQuery ? "No matching performances" : "No performances yet"}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery ? `No gigs found matching "${searchQuery}"` : "Add your first gig to start tracking."}
                </p>
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 dark:hover:bg-brand-700"
                  >
                    Clear Search
                  </button>
                ) : (
                  <button
                    onClick={() => setShowForm(true)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 dark:hover:bg-brand-700"
                  >
                    <Icons.Plus className="h-4 w-4" />
                    Add Performance
                  </button>
                )}
              </div>
            ) : (
              <div className={effectiveWideView ? "grid gap-6 xl:grid-cols-2 2xl:gap-8" : "space-y-6"}>
                {/* Active Gigs Section */}
                {activeGigs.length > 0 && (
                  <div className="min-w-0">
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIsActiveSectionExpanded((prev) => !prev)}
                                className="rounded p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                                title={isActiveSectionExpanded ? "Collapse section" : "Expand section"}
                              >
                                <Icons.ChevronDown className={`h-4 w-4 transition-transform ${isActiveSectionExpanded ? "rotate-0" : "-rotate-90"}`} />
                              </button>
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                Active Performances
                              </h3>
                              <span className="rounded-full bg-brand-100 dark:bg-brand-900/40 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
                                {activeGigs.length}
                              </span>
                            </div>
                            {activeGigs.length > 0 && isActiveSectionExpanded && (
                              <div className="flex gap-1">
                                <button
                                  onClick={handleExpandAll}
                                  title="Expand all (Cmd+E)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <Icons.ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCollapseAll}
                                  title="Collapse all (Cmd+C)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <Icons.ChevronDown className="h-4 w-4" />
                                </button>
                                <div className="mx-1 w-px bg-slate-200 dark:bg-slate-700" />
                                <button
                                  onClick={handleSelectAll}
                                  title="Select all performances"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <Icons.CheckCircle className="h-4 w-4" />
                                </button>
                                {selectedGigIds.size > 0 && (
                                  <>
                                    <button
                                      onClick={() => setShowBulkEditor(true)}
                                      title={`Bulk edit (${selectedGigIds.size} selected)`}
                                      className="rounded p-1 text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs"
                                    >
                                      <Icons.Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={handleClearSelection}
                                      title="Clear selection"
                                      className="rounded px-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                    >
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {isActiveSectionExpanded && (
                            overviewViewMode === "compact" ? (
                              <div className="space-y-2">
                                {activeGigs.map((gig, idx) => (
                                  <div key={gig.id} className={`animate-fade-in animate-stagger-${Math.min(idx + 1, 10)}`}>
                                    <OverviewCompactRow gig={gig} onEdit={handleEditGig} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                            <div className={effectiveWideView ? "grid gap-4 lg:grid-cols-1 2xl:grid-cols-2" : "grid gap-5 xl:grid-cols-2 2xl:grid-cols-3"}>
                              {activeGigs.map((gig, idx) => (
                                <div key={gig.id} className={`animate-fade-in animate-stagger-${Math.min(idx + 1, 10)}`}>
                                  <GigCard
                                    gig={gig}
                                    onEdit={handleEditGig}
                                    fmtCurrency={fmtCurrency}
                                    claimPerformanceFee={gig.claimPerformanceFee}
                                    claimTechnicalFee={gig.claimTechnicalFee}
                                    isExpandedGlobal={globalExpandState}
                                    isSelected={selectedGigIds.has(gig.id)}
                                    onSelect={handleToggleGigSelection}
                                  />
                                </div>
                              ))}
                            </div>
                            )
                          )}
                  </div>
                )}

                {/* Handled Gigs Section */}
                {handledGigs.length > 0 && (
                  <div className="min-w-0">
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIsHandledSectionExpanded((prev) => !prev)}
                                className="rounded p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                                title={isHandledSectionExpanded ? "Collapse section" : "Expand section"}
                              >
                                <Icons.ChevronDown className={`h-4 w-4 transition-transform ${isHandledSectionExpanded ? "rotate-0" : "-rotate-90"}`} />
                              </button>
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                Handled Performances
                              </h3>
                              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                {handledGigs.length}
                              </span>
                            </div>
                            {handledGigs.length > 0 && isHandledSectionExpanded && (
                              <div className="flex gap-1">
                                <button
                                  onClick={handleExpandAll}
                                  title="Expand all (Cmd+E)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <Icons.ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCollapseAll}
                                  title="Collapse all (Cmd+C)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <Icons.ChevronDown className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                          {isHandledSectionExpanded && (
                            overviewViewMode === "compact" ? (
                              <div className="space-y-2">
                                {handledGigs.map((gig, idx) => (
                                  <div key={gig.id} className={`animate-fade-in animate-stagger-${Math.min(idx + 1, 10)}`}>
                                    <OverviewCompactRow gig={gig} onEdit={handleEditGig} isHandled />
                                  </div>
                                ))}
                              </div>
                            ) : (
                            <div className={effectiveWideView ? "grid gap-4 lg:grid-cols-1 2xl:grid-cols-2" : "grid gap-5 xl:grid-cols-2 2xl:grid-cols-3"}>
                              {handledGigs.map((gig, idx) => (
                                <div key={gig.id} className={`animate-fade-in animate-stagger-${Math.min(idx + 1, 10)}`}>
                                  <GigCard
                                    gig={gig}
                                    onEdit={handleEditGig}
                                    fmtCurrency={fmtCurrency}
                                    claimPerformanceFee={gig.claimPerformanceFee}
                                    claimTechnicalFee={gig.claimTechnicalFee}
                                    isExpandedGlobal={globalExpandState}
                                    isSelected={selectedGigIds.has(gig.id)}
                                    onSelect={handleToggleGigSelection}
                                  />
                                </div>
                              ))}
                            </div>
                            )
                          )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : selectedTab === "all-gigs" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <AllGigsTab 
              gigs={gigs}
              onEdit={handleEditGig}
              onDelete={(gig) => setDeleteGig(gig)}
              onDuplicate={handleDuplicateGig}
              onAddNew={() => setShowForm(true)}
              fmtCurrency={fmtCurrency}
              loading={loading}
            />
          </Suspense>
        ) : selectedTab === "analytics" ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-2 shadow-sm backdrop-blur">
              <button
                onClick={() => setInsightsView("analytics")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  insightsView === "analytics"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <Icons.Analytics className="h-4 w-4" />
                <span>{t('dashboard.analyticsSubTab', 'Analytics')}</span>
              </button>
              <button
                onClick={() => setInsightsView("reports")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  insightsView === "reports"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <Icons.Document className="h-4 w-4" />
                <span>{t('dashboard.reportsSubTab', 'Reports')}</span>
              </button>
              <button
                onClick={() => setInsightsView("ai-predictions")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  insightsView === "ai-predictions"
                    ? "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <Icons.Sparkles className="h-4 w-4 text-amber-300 dark:text-amber-300" />
                <span>{t('dashboard.aiPredictionsSubTab', 'AI Predictions & Smart Insights')}</span>
              </button>
            </div>
            <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
              {insightsView === "analytics" ? (
                <AnalyticsPage gigs={gigs} fmtCurrency={fmtCurrency} />
              ) : insightsView === "reports" ? (
                <FinancialReports fmtCurrency={fmtCurrency} />
              ) : (
                <AIPredictionsTab gigs={gigs} fmtCurrency={fmtCurrency} />
              )}
            </Suspense>
          </div>
        ) : selectedTab === "investments" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <InvestmentsTab fmtCurrency={fmtCurrency} />
          </Suspense>
        ) : selectedTab === "band-members" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <BandMembers fmtCurrency={fmtCurrency} gigs={gigs} />
          </Suspense>
        ) : selectedTab === "setlists" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <SetlistsTab />
          </Suspense>
        ) : selectedTab === "songs" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <SongsTab />
          </Suspense>
        ) : selectedTab === "bands" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <BandsTab />
          </Suspense>
        ) : selectedTab === "shared-links" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <SharedLinksTab />
          </Suspense>
        ) : selectedTab === "calendar" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <CalendarView 
              fmtCurrency={fmtCurrency} 
              gigs={gigs}
              onEditGig={handleEditGigById} 
            />
          </Suspense>
        ) : selectedTab === "superadmin" ? (
          <Suspense fallback={<TabLoader message={t('dashboard.loadingSection')} />}>
            <SuperAdminTab />
          </Suspense>
        ) : null}
      </main>

      {/* -- Modals ----------------------------------------------------- */}
      {showForm && (
        <GigForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {editGig && (
        <GigForm
          gig={editGig}
          onSubmit={handleUpdate}
          onCancel={() => setEditGig(null)}
          onDelete={(gig) => {
            setEditGig(null);
            setDeleteGig(gig);
          }}
        />
      )}
      {deleteGig && (
        <DeleteConfirm
          gigName={deleteGig.eventName}
          onConfirm={handleDelete}
          onCancel={() => setDeleteGig(null)}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showBulkEditor && (
        <BulkEditor
          gigs={gigs}
          selectedIds={selectedGigIds}
          onClose={() => setShowBulkEditor(false)}
          onSuccess={() => {
            setSelectedGigIds(new Set());
            toast.success("Gigs updated successfully!");
            fetchGigs();
          }}
        />
      )}
      {/* -- Keyboard Shortcuts ----------------------------------------- */}
      {showKeyboardShortcuts && (
        <KeyboardShortcuts
          shortcuts={shortcuts}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          isOpen={showKeyboardShortcuts}
          onClose={() => setShowKeyboardShortcuts(false)}
        />
      )}

      {/* -- Footer ------------------------------------------------------ */}
      <Footer />
    </div>
  );
}
