"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from "react";
import type { Gig, GigFormData, DashboardSummary } from "@/types";
import { calculateGigFinancials } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import LandingPage from "./LandingPage";
import GigCard from "./GigCard";
import GigForm from "./GigForm";
import DeleteConfirm from "./DeleteConfirm";
import SettingsModal from "./SettingsModal";
import Footer from "./Footer";
import KeyboardShortcuts from "./KeyboardShortcuts";
import { DashboardSummary as DashboardSummaryComponent } from "./DashboardSummary";
import BulkEditor from "./BulkEditor";
import LoadingSpinner, { CardSkeleton } from "./LoadingSpinner";

// Lazy load heavy components for better initial load time
const AnalyticsPage = lazy(() => import("./AnalyticsPage"));
const InvestmentsTab = lazy(() => import("./InvestmentsTab"));
const AllGigsTab = lazy(() => import("./AllGigsTab"));
const BandMembers = lazy(() => import("./BandMembers"));
const FinancialReports = lazy(() => import("./FinancialReports"));
const CalendarView = lazy(() => import("./CalendarView"));
const SetlistsTab = lazy(() => import("./SetlistsTab"));

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-300" />
  </div>
);


export default function Dashboard() {
  const { session, isLoading: authLoading, signOut, getAccessToken } = useAuth();
  const { settings, fmtCurrency } = useSettings();
  const toast = useToast();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [totalGigCount, setTotalGigCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGig, setEditGig] = useState<Gig | null>(null);
  const [deleteGig, setDeleteGig] = useState<Gig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"gigs" | "all-gigs" | "analytics" | "investments" | "band-members" | "reports" | "calendar" | "setlists">("gigs");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [globalExpandState, setGlobalExpandState] = useState<boolean | undefined>(undefined);
  const [selectedGigIds, setSelectedGigIds] = useState<Set<string>>(new Set());
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(true);

  // Load overview expanded preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("overview-expanded");
      if (saved !== null) {
        setIsOverviewExpanded(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load overview preference:", e);
    }
  }, []);

  // Save overview expanded preference to localStorage
  const handleToggleOverview = useCallback(() => {
    setIsOverviewExpanded((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem("overview-expanded", JSON.stringify(newVal));
      } catch (e) {
        console.error("Failed to save overview preference:", e);
      }
      return newVal;
    });
  }, []);

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

  // -- Data fetching ----------------------------------------------------------

  const fetchGigs = useCallback(async () => {
    if (!session?.user) {
      console.log("[fetchGigs] No user session");
      setGigs([]);
      setTotalGigCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
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
        headers: { Authorization: `Bearer ${token}` },
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
              headers: { Authorization: `Bearer ${newToken}` },
            });
            if (retryRes.ok) {
              const json = await retryRes.json();
              setGigs(json.data ?? json);
              setTotalGigCount(json.total ?? (json.data ?? json).length);
              console.log("[fetchGigs] Success after retry:", (json.data ?? json).length, "gigs");
              return;
            }
          }
          toast.error("Session expired. Please sign out and sign in again.");
        } else {
          const errorText = await res.text();
          console.error("[fetchGigs] Error response:", errorText);
          toast.error("Failed to load gigs.");
        }
        setGigs([]);
        setTotalGigCount(0);
      } else {
        const json = await res.json();
        console.log("[fetchGigs] Success:", json.total || (json.data ?? json).length, "gigs");
        setGigs(json.data ?? json);
        setTotalGigCount(json.total ?? (json.data ?? json).length);
      }
    } catch (err) {
      console.error("Fetch gigs error:", err);
      toast.error("Failed to load gigs.");
    } finally {
      setLoading(false);
    }
  }, [session?.user, getAccessToken]);

  useEffect(() => {
    fetchGigs();
  }, [fetchGigs]);

  // Filter gigs based on search query
  const filteredGigs = useMemo(() => {
    if (!searchQuery.trim()) return gigs;
    const query = searchQuery.toLowerCase();
    return gigs.filter((gig) =>
      gig.eventName.toLowerCase().includes(query) ||
      gig.performers.toLowerCase().includes(query) ||
      (gig.notes && gig.notes.toLowerCase().includes(query)) ||
      (gig.performanceLineup && gig.performanceLineup.toLowerCase().includes(query))
    );
  }, [gigs, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
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

  const handleExpandAll = () => {
    setGlobalExpandState(true);
    toast.info("Expanded all performances");
  };

  const handleCollapseAll = () => {
    setGlobalExpandState(false);
    toast.info("Collapsed all performances");
  };

  const handleExport = async (type: "gigs" | "summary" | "report") => {
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error("Could not get session. Please sign out and sign in again.");
        return;
      }

      const format = type === "report" ? "json" : "csv";
      const responsePromise = fetch(`/api/exports/summary?type=${type}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.info("Generating export...");
      const response = await responsePromise;

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const file = new File([blob], `export-${Date.now()}.${format}`, {
        type: format === "json" ? "application/json" : "text/csv",
      });

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Export downloaded successfully!");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Export failed";
      console.error("[handleExport]", msg);
      toast.error(msg);
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
    () =>
      gigs.reduce(
        (acc, g) => {
          const c = calculateGigFinancials(
            g.performanceFee,
            g.technicalFee,
            g.managerBonusType,
            g.managerBonusAmount,
            g.numberOfMusicians,
            g.claimPerformanceFee,
            g.claimTechnicalFee,
            g.technicalFeeClaimAmount,
            g.advanceReceivedByManager,
            g.advanceToMusicians,
            g.isCharity
          );
          acc.totalGigs += 1;
          acc.totalEarnings += c.myEarnings;
          if (g.paymentReceived) {
            // Full payment received
            acc.totalEarningsReceived += c.myEarnings;
          } else {
            // Only advance received so far, rest is still pending
            acc.totalEarningsReceived += c.myEarningsAlreadyReceived;
            acc.totalEarningsPending += c.myEarningsStillOwed;

            // Track pending amount by band/performer
            const bandName = g.performers || "Unknown";
            const totalGigValue = c.totalReceived;
            const pendingAmount = Math.max(0, totalGigValue - g.advanceReceivedByManager);
            const existing = acc.pendingByBand.find((b) => b.band === bandName);
            if (existing) {
              existing.amount += pendingAmount;
              existing.count += 1;
            } else {
              acc.pendingByBand.push({
                band: bandName,
                amount: pendingAmount,
                count: 1,
              });
            }
          }
          if (!g.paymentReceived) acc.pendingClientPayments += 1;
          if (!g.bandPaid && g.managerHandlesDistribution) acc.outstandingToBand += c.amountOwedToOthers;
          return acc;
        },
        {
          totalGigs: 0,
          totalEarnings: 0,
          totalEarningsReceived: 0,
          totalEarningsPending: 0,
          pendingClientPayments: 0,
          outstandingToBand: 0,
          pendingByBand: [],
        } as DashboardSummary
      ),
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

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Show login if not authenticated
  if (!session?.user) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors">
      {/* -- Navbar -------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg dark:backdrop-blur-xl transition-colors">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2.5 sm:px-6 sm:py-3">
          {/* Left: Hamburger (mobile) + Logo */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition flex-shrink-0"
              title="Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {showMobileMenu ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
            
            <img
              src="/favicon.png"
              alt="GigsManager"
              className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 rounded-lg"
            />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
              Gigs<span className="text-gold-600 dark:text-gold-400">Manager</span>
            </h1>
          </div>

          {/* Center: Search (desktop) */}
          <div className="hidden md:block flex-1 max-w-md mx-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search gigs..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900 dark:text-slate-100 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                  title="Clear search"
                >
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Right: Add + Profile (always visible) */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Add Performance - icon only on mobile, button on desktop */}
            <button
              onClick={() => {
                setEditGig(null);
                setShowForm(true);
              }}
              className="p-1.5 sm:p-0 sm:px-3 sm:py-2 rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800 flex-shrink-0"
              title="Add Performance"
            >
              <svg className="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="hidden sm:inline-flex items-center gap-1 text-sm font-medium">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </span>
            </button>

            {/* Profile menu (merged with settings & sign out) */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu((open) => !open)}
                title="Profile & Settings"
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 flex-shrink-0"
              >
                {session.user?.user_metadata?.avatar_url ? (
                  <img
                    src={session.user.user_metadata.avatar_url}
                    alt="Profile avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (session.user?.user_metadata?.name || session.user?.email || "?").charAt(0).toUpperCase()
                )}
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                  {/* Profile info header */}
                  <div className="border-b border-slate-200 dark:border-slate-700 p-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      {session.user?.user_metadata?.name || "Profile"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {session.user?.email}
                    </p>
                  </div>
                  {/* Menu items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setShowKeyboardShortcuts(true);
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Keyboard shortcuts
                    </button>
                    <div className="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2">
                      <button
                        onClick={async () => {
                          setShowProfileMenu(false);
                          await signOut();
                        }}
                        className="w-full px-3 py-2 text-left text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
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
      </header>

      {/* Mobile menu overlay - OUTSIDE header for full viewport coverage */}
      {showMobileMenu && (
        <>
          <div className="lg:hidden fixed inset-0 z-[100] bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="lg:hidden fixed left-0 top-0 bottom-0 z-[101] w-64 bg-white dark:bg-slate-900 shadow-xl overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Menu</h2>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Mobile search */}
              <div className="mb-4 md:hidden">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search gigs..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                    >
                      <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                <button
                  onClick={() => { setActiveTab("gigs"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "gigs" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.25Zm9-9.75A2.25 2.25 0 0 1 15 3.75H17.25a2.25 2.25 0 0 1 2.25 2.25V6A2.25 2.25 0 0 1 17.25 8.25H15a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 15 13.5H17.25a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 17.25 20.25H15a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                  </svg>
                  Overview
                </button>
                <button
                  onClick={() => { setActiveTab("calendar"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "calendar" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  Calendar
                </button>
                <button
                  onClick={() => { setActiveTab("all-gigs"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "all-gigs" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                  All Gigs
                </button>
                <button
                  onClick={() => { setActiveTab("band-members"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "band-members" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  Band Members
                </button>
                <button
                  onClick={() => { setActiveTab("setlists"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "setlists" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  </svg>
                  Setlists
                </button>
                <button
                  onClick={() => { setActiveTab("analytics"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "analytics" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 6.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75ZM16.5 6.75c0-.621.504-1.125 1.125-1.125h2.25C20.496 5.625 21 6.129 21 6.75v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75Z" />
                  </svg>
                  Analytics
                </button>
                <button
                  onClick={() => { setActiveTab("reports"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "reports" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  Reports
                </button>
                <button
                  onClick={() => { setActiveTab("investments"); setShowMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === "investments" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0M9.75 17.25c0 .552-.448 1-1 1H5.625c-.552 0-1-.448-1-1m12.621-4.47c.409-.34.659-.934.659-1.591v-2.64c0-1.228-.841-2.265-1.964-2.565A6.521 6.521 0 0 0 12 2.25c-1.466 0-2.869.36-4.095 1.001C6.041 3.476 5.2 4.513 5.2 5.74v2.637c0 .657.25 1.251.659 1.591m0 0c.409.34 1.227.855 2.966 1.694C9.75 15.75 11.565 16.5 12 16.5c.435 0 2.25-.75 3.175-1.32 1.738-.839 2.557-1.354 2.966-1.694" />
                  </svg>
                  Investments
                </button>
              </nav>
            </div>
          </div>
        </>
      )}

      <main className="mx-auto max-w-6xl px-3 sm:px-4 py-4 sm:py-8 sm:px-6 dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 min-h-screen transition-colors">
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
        <div className="mb-4 sm:mb-8">
          {/* Overview collapse header with export actions */}
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Overview</h2>
            <div className="flex items-center gap-1.5">
              {/* Export buttons */}
              <button
                onClick={() => handleExport("gigs")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                title="Export all gigs as CSV"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33A3 3 0 0 1 20.25 10.5H16.5" />
                </svg>
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={() => handleExport("summary")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                title="Export financial summary as CSV"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.66V18a2.25 2.25 0 002.25 2.25H18M9 9h3.75" />
                </svg>
                <span className="hidden sm:inline">Summary</span>
              </button>
              <button
                onClick={() => handleExport("report")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                title="Export financial report as JSON"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.875 14.25l1.06-1.061a2.25 2.25 0 113.182 0l1.060 1.061M3 7.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 10.125v-2.25zm9-3c-.621 0-1.125.504-1.125 1.125v2.25c0 .621.504 1.125 1.125 1.125h2.25c.621 0 1.125-.504 1.125-1.125v-2.25c0-.621-.504-1.125-1.125-1.125h-2.25zm-9 9c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 19.875v-2.25zm9 0c-.621 0-1.125.504-1.125 1.125v2.25c0 .621.504 1.125 1.125 1.125h2.25c.621 0 1.125-.504 1.125-1.125v-2.25c0-.621-.504-1.125-1.125-1.125h-2.25z" />
                </svg>
                <span className="hidden sm:inline">Report</span>
              </button>
              {/* Collapse/expand toggle */}
              <button
                onClick={handleToggleOverview}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
                title={isOverviewExpanded ? "Collapse overview" : "Expand overview"}
              >
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${isOverviewExpanded ? "rotate-0" : "-rotate-90"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            </div>
          </div>
          {/* Collapsible content */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isOverviewExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <DashboardSummaryComponent summary={summary} gigs={gigs} fmtCurrency={fmtCurrency} />
          </div>
        </div>

        {/* -- Tabs (desktop only) ----------------------------------------------------- */}
        <div className="mb-6 hidden lg:flex gap-1 sm:gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {/* Overview */}
          <button
            onClick={() => setActiveTab("gigs")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "gigs"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.25Zm9-9.75A2.25 2.25 0 0 1 15 3.75H17.25a2.25 2.25 0 0 1 2.25 2.25V6A2.25 2.25 0 0 1 17.25 8.25H15a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 15 13.5H17.25a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 17.25 20.25H15a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
              <span className="hidden sm:inline">Overview</span>
            </span>
          </button>
          {/* Calendar */}
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "calendar"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span className="hidden sm:inline">Calendar</span>
            </span>
          </button>
          {/* All Gigs */}
          <button
            onClick={() => setActiveTab("all-gigs")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "all-gigs"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <span className="hidden sm:inline">All Gigs</span>
            </span>
          </button>
          {/* Band Members */}
          <button
            onClick={() => setActiveTab("band-members")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "band-members"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <span className="hidden sm:inline">Band</span>
            </span>
          </button>
          {/* Setlists */}
          <button
            onClick={() => setActiveTab("setlists")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "setlists"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
              <span className="hidden sm:inline">Setlists</span>
            </span>
          </button>
          {/* Analytics */}
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "analytics"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 6.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75ZM16.5 6.75c0-.621.504-1.125 1.125-1.125h2.25C20.496 5.625 21 6.129 21 6.75v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75Z" />
              </svg>
              <span className="hidden sm:inline">Analytics</span>
            </span>
          </button>
          {/* Reports */}
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "reports"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="hidden sm:inline">Reports</span>
            </span>
          </button>
          {/* Investments */}
          <button
            onClick={() => setActiveTab("investments")}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeTab === "investments"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0M9.75 17.25c0 .552-.448 1-1 1H5.625c-.552 0-1-.448-1-1m12.621-4.47c.409-.34.659-.934.659-1.591v-2.64c0-1.228-.841-2.265-1.964-2.565A6.521 6.521 0 0 0 12 2.25c-1.466 0-2.869.36-4.095 1.001C6.041 3.476 5.2 4.513 5.2 5.74v2.637c0 .657.25 1.251.659 1.591m0 0c.409.34 1.227.855 2.966 1.694C9.75 15.75 11.565 16.5 12 16.5c.435 0 2.25-.75 3.175-1.32 1.738-.839 2.557-1.354 2.966-1.694" />
              </svg>
              <span className="hidden sm:inline">Invest</span>
            </span>
          </button>
        </div>



        {/* -- Content -------------------------------------------------- */}
        {activeTab === "gigs" ? (
          <>
            {/* -- Overview: Smart sorted performances ---------------------- */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : filteredGigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-20 text-center">
                <svg className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
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
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Performance
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Gigs Section */}
                {activeGigs.length > 0 && (
                  <div>
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                Active Performances
                              </h3>
                              <span className="rounded-full bg-brand-100 dark:bg-brand-900/40 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
                                {activeGigs.length}
                              </span>
                            </div>
                            {activeGigs.length > 0 && (
                              <div className="flex gap-1">
                                <button
                                  onClick={handleExpandAll}
                                  title="Expand all (Cmd+E)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={handleCollapseAll}
                                  title="Collapse all (Cmd+C)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                <div className="mx-1 w-px bg-slate-200 dark:bg-slate-700" />
                                <button
                                  onClick={handleSelectAll}
                                  title="Select all performances"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                                {selectedGigIds.size > 0 && (
                                  <>
                                    <button
                                      onClick={() => setShowBulkEditor(true)}
                                      title={`Bulk edit (${selectedGigIds.size} selected)`}
                                      className="rounded p-1 text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs"
                                    >
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 9.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={handleClearSelection}
                                      title="Clear selection"
                                      className="rounded px-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                    >
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="grid gap-5">
                            {activeGigs.map((gig) => (
                              <GigCard
                                key={gig.id}
                                gig={gig}
                                onEdit={handleEditGig}
                                fmtCurrency={fmtCurrency}
                                claimPerformanceFee={gig.claimPerformanceFee}
                                claimTechnicalFee={gig.claimTechnicalFee}
                                isExpandedGlobal={globalExpandState}
                                isSelected={selectedGigIds.has(gig.id)}
                                onSelect={handleToggleGigSelection}
                              />
                            ))}
                          </div>
                  </div>
                )}

                {/* Handled Gigs Section */}
                {handledGigs.length > 0 && (
                  <div>
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                                Handled Performances
                              </h3>
                              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                {handledGigs.length}
                              </span>
                            </div>
                            {handledGigs.length > 0 && (
                              <div className="flex gap-1">
                                <button
                                  onClick={handleExpandAll}
                                  title="Expand all (Cmd+E)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={handleCollapseAll}
                                  title="Collapse all (Cmd+C)"
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 text-xs"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="grid gap-5">
                            {handledGigs.map((gig) => (
                              <GigCard
                                key={gig.id}
                                gig={gig}
                                onEdit={handleEditGig}
                                fmtCurrency={fmtCurrency}
                                claimPerformanceFee={gig.claimPerformanceFee}
                                claimTechnicalFee={gig.claimTechnicalFee}
                                isExpandedGlobal={globalExpandState}
                                isSelected={selectedGigIds.has(gig.id)}
                                onSelect={handleToggleGigSelection}
                              />
                            ))}
                          </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : activeTab === "all-gigs" ? (
          <Suspense fallback={<TabLoader />}>
            <AllGigsTab 
              gigs={gigs}
              onEdit={handleEditGig}
              fmtCurrency={fmtCurrency}
              loading={loading}
            />
          </Suspense>
        ) : activeTab === "analytics" ? (
          <Suspense fallback={<TabLoader />}>
            <AnalyticsPage gigs={gigs} fmtCurrency={fmtCurrency} />
          </Suspense>
        ) : activeTab === "investments" ? (
          <Suspense fallback={<TabLoader />}>
            <InvestmentsTab fmtCurrency={fmtCurrency} />
          </Suspense>
        ) : activeTab === "band-members" ? (
          <Suspense fallback={<TabLoader />}>
            <BandMembers fmtCurrency={fmtCurrency} />
          </Suspense>
        ) : activeTab === "setlists" ? (
          <Suspense fallback={<TabLoader />}>
            <SetlistsTab />
          </Suspense>
        ) : activeTab === "reports" ? (
          <Suspense fallback={<TabLoader />}>
            <FinancialReports fmtCurrency={fmtCurrency} />
          </Suspense>
        ) : activeTab === "calendar" ? (
          <Suspense fallback={<TabLoader />}>
            <CalendarView 
              fmtCurrency={fmtCurrency} 
              onEditGig={handleEditGigById} 
            />
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
