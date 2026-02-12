"use client";

import { useState, useEffect, useCallback } from "react";
import type { Gig, GigFormData, DashboardSummary } from "@/types";
import { calculateGigFinancials } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import LandingPage from "./LandingPage";
import GigCard from "./GigCard";
import GigForm from "./GigForm";
import DeleteConfirm from "./DeleteConfirm";
import SettingsModal from "./SettingsModal";
import AnalyticsPage from "./AnalyticsPage";
import InvestmentsTab from "./InvestmentsTab";
import AllGigsTab from "./AllGigsTab";
import Footer from "./Footer";
import { DashboardSummary as DashboardSummaryComponent } from "./DashboardSummary";

export default function Dashboard() {
  const { session, isLoading: authLoading, signOut, getAccessToken } = useAuth();
  const { settings, fmtCurrency } = useSettings();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [totalGigCount, setTotalGigCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGig, setEditGig] = useState<Gig | null>(null);
  const [deleteGig, setDeleteGig] = useState<Gig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [activeTab, setActiveTab] = useState<"gigs" | "all-gigs" | "analytics" | "investments">("gigs");

  // ── Data fetching ──────────────────────────────────────────────────────────

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
          flash("Session expired. Please sign out and sign in again.", "err");
        } else {
          const errorText = await res.text();
          console.error("[fetchGigs] Error response:", errorText);
          flash("Failed to load gigs.", "err");
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
      flash("Failed to load gigs.", "err");
    } finally {
      setLoading(false);
    }
  }, [session?.user, getAccessToken]);

  useEffect(() => {
    fetchGigs();
  }, [fetchGigs]);

  // ── Toast helper ───────────────────────────────────────────────────────────

  const flash = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleCreate = async (data: GigFormData) => {
    try {
      const token = await getAccessToken();

      if (!token) {
        flash("Could not get session. Please sign out and sign in again.", "err");
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
      flash("Performance added!");
      fetchGigs();
    } catch (err: any) {
      flash(err.message || "Failed to create gig.", "err");
    }
  };

  const handleUpdate = async (data: GigFormData) => {
    if (!editGig) return;
    try {
      const token = await getAccessToken();

      if (!token) {
        flash("Could not get session. Please sign out and sign in again.", "err");
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
      flash("Performance updated!");
      fetchGigs();
    } catch (err: any) {
      flash(err.message || "Failed to update gig.", "err");
    }
  };

  const handleDelete = async () => {
    if (!deleteGig) return;
    // Optimistic: remove from UI immediately
    const prev = gigs;
    setGigs((g) => g.filter((x) => x.id !== deleteGig.id));
    setDeleteGig(null);
    try {
      const token = await getAccessToken();

      if (!token) {
        setGigs(prev);
        flash("Could not get session. Please sign out and sign in again.", "err");
        return;
      }

      const res = await fetch(`/api/gigs/${deleteGig.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error();
      flash("Performance deleted.");
      fetchGigs(); // re-sync
    } catch {
      setGigs(prev); // rollback on failure
      flash("Delete failed — restored.", "err");
    }
  };

  // ── Summary calculation ────────────────────────────────────────────────────

  const summary: DashboardSummary = gigs.reduce(
    (acc, g) => {
      const c = calculateGigFinancials(
        g.performanceFee,
        g.technicalFee,
        g.managerBonusType,
        g.managerBonusAmount,
        g.numberOfMusicians,
        g.claimPerformanceFee,
        g.claimTechnicalFee,
        g.technicalFeeClaimAmount
      );
      acc.totalGigs += 1;
      acc.totalEarnings += c.myEarnings;
      if (g.paymentReceived) {
        acc.totalEarningsReceived += c.myEarnings;
      } else {
        acc.totalEarningsPending += c.myEarnings;
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
    } as DashboardSummary
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg dark:backdrop-blur-xl transition-colors">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2.5 sm:px-6 sm:py-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-brand-600 shadow-sm flex-shrink-0">
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
              </svg>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
              Gigs<span className="text-brand-600 dark:text-brand-400">Manager</span>
            </h1>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Email - hidden on mobile */}
            <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-400">
              {session.user?.email}
            </div>

            {/* Settings button - icon only */}
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg flex-shrink-0"
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>

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

            {/* Sign Out - icon only on mobile, button on desktop */}
            <button
              onClick={async () => {
                await signOut();
              }}
              className="p-1.5 sm:p-0 sm:px-3 sm:py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-300 dark:hover:bg-slate-700 flex-shrink-0"
              title="Sign Out"
            >
              <svg className="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25" />
              </svg>
              <span className="hidden sm:inline text-sm font-medium">
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 min-h-screen transition-colors">
        {/* ── Premium Summary Cards ─────────────────────────────────── */}
        <div className="mb-8">
          <DashboardSummaryComponent summary={summary} gigs={gigs} fmtCurrency={fmtCurrency} />
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <button
            onClick={() => setActiveTab("gigs")}
            className={`px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
              activeTab === "gigs"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.25Zm9-9.75A2.25 2.25 0 0 1 15 3.75H17.25a2.25 2.25 0 0 1 2.25 2.25V6A2.25 2.25 0 0 1 17.25 8.25H15a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 15 13.5H17.25a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 17.25 20.25H15a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
              Recent
            </span>
          </button>
          <button
            onClick={() => setActiveTab("all-gigs")}
            className={`px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
              activeTab === "all-gigs"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              All Gigs
            </span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
              activeTab === "analytics"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 6.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75ZM16.5 6.75c0-.621.504-1.125 1.125-1.125h2.25C20.496 5.625 21 6.129 21 6.75v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75Z" />
              </svg>
              Analytics
            </span>
          </button>
          <button
            onClick={() => setActiveTab("investments")}
            className={`px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
              activeTab === "investments"
                ? "border-b-2 border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0M9.75 17.25c0 .552-.448 1-1 1H5.625c-.552 0-1-.448-1-1m12.621-4.47c.409-.34.659-.934.659-1.591v-2.64c0-1.228-.841-2.265-1.964-2.565A6.521 6.521 0 0 0 12 2.25c-1.466 0-2.869.36-4.095 1.001C6.041 3.476 5.2 4.513 5.2 5.74v2.637c0 .657.25 1.251.659 1.591m0 0c.409.34 1.227.855 2.966 1.694C9.75 15.75 11.565 16.5 12 16.5c.435 0 2.25-.75 3.175-1.32 1.738-.839 2.557-1.354 2.966-1.694" />
              </svg>
              Investments
            </span>
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        {activeTab === "gigs" ? (
          <>
            {/* ── Recent Gigs (chronologically sorted, newest first) ────────– */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : gigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-20 text-center">
                <svg className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  No performances yet
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Add your first gig to start tracking.
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 dark:hover:bg-brand-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add Performance
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  // Smart sorting: active gigs (upcoming or unpaid) vs handled gigs (past & fully paid)
                  const activeGigs = gigs.filter((gig) => {
                    const gigDate = new Date(gig.date);
                    gigDate.setHours(0, 0, 0, 0);
                    const isUpcoming = gigDate >= today;
                    const isUnpaid = !gig.paymentReceived || !gig.bandPaid;
                    return isUpcoming || isUnpaid;
                  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  const handledGigs = gigs.filter((gig) => {
                    const gigDate = new Date(gig.date);
                    gigDate.setHours(0, 0, 0, 0);
                    const isPast = gigDate < today;
                    const isFullyPaid = gig.paymentReceived && gig.bandPaid;
                    return isPast && isFullyPaid;
                  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  return (
                    <>
                      {/* Active Gigs Section */}
                      {activeGigs.length > 0 && (
                        <div>
                          <div className="mb-4 flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                              Active Performances
                            </h3>
                            <span className="rounded-full bg-brand-100 dark:bg-brand-900/40 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
                              {activeGigs.length}
                            </span>
                          </div>
                          <div className="grid gap-5">
                            {activeGigs.map((gig) => (
                              <GigCard
                                key={gig.id}
                                gig={gig}
                                onEdit={(g) => setEditGig(g)}
                                onDelete={(g) => setDeleteGig(g)}
                                fmtCurrency={fmtCurrency}
                                claimPerformanceFee={gig.claimPerformanceFee}
                                claimTechnicalFee={gig.claimTechnicalFee}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Handled Gigs Section */}
                      {handledGigs.length > 0 && (
                        <div>
                          <div className="mb-4 flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                              Handled Performances
                            </h3>
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              {handledGigs.length}
                            </span>
                          </div>
                          <div className="grid gap-5">
                            {handledGigs.map((gig) => (
                              <GigCard
                                key={gig.id}
                                gig={gig}
                                onEdit={(g) => setEditGig(g)}
                                onDelete={(g) => setDeleteGig(g)}
                                fmtCurrency={fmtCurrency}
                                claimPerformanceFee={gig.claimPerformanceFee}
                                claimTechnicalFee={gig.claimTechnicalFee}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        ) : activeTab === "all-gigs" ? (
          <AllGigsTab 
            gigs={gigs}
            onEdit={(g) => setEditGig(g)}
            onDelete={(g) => setDeleteGig(g)}
            fmtCurrency={fmtCurrency}
            loading={loading}
          />
        ) : activeTab === "analytics" ? (
          <AnalyticsPage gigs={gigs} fmtCurrency={fmtCurrency} />
        ) : activeTab === "investments" ? (
          <InvestmentsTab fmtCurrency={fmtCurrency} />
        ) : null}
      </main>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showForm && (
        <GigForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {editGig && (
        <GigForm
          gig={editGig}
          onSubmit={handleUpdate}
          onCancel={() => setEditGig(null)}
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

      {/* ── Toast ────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-5 py-2.5 text-sm font-medium shadow-lg transition ${
            toast.type === "ok"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <Footer />
    </div>
  );
}
