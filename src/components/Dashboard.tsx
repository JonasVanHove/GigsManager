"use client";

import { useState, useEffect, useCallback } from "react";
import type { Gig, GigFormData, DashboardSummary } from "@/types";
import { calculateGigFinancials, formatCurrency } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";
import { LoginForm } from "./LoginForm";
import GigCard from "./GigCard";
import GigForm from "./GigForm";
import DeleteConfirm from "./DeleteConfirm";

export default function Dashboard() {
  const { session, isLoading: authLoading, signOut, getAccessToken } = useAuth();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [totalGigCount, setTotalGigCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGig, setEditGig] = useState<Gig | null>(null);
  const [deleteGig, setDeleteGig] = useState<Gig | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchGigs = useCallback(async () => {
    if (!session?.user) {
      setGigs([]);
      setTotalGigCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();

      if (!token) {
        // Token not available yet — don't show error, just wait
        setLoading(false);
        return;
      }

      const res = await fetch("/api/gigs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Token might be expired — try to refresh
          const newToken = await getAccessToken();
          if (newToken) {
            const retryRes = await fetch("/api/gigs", {
              headers: { Authorization: `Bearer ${newToken}` },
            });
            if (retryRes.ok) {
              const json = await retryRes.json();
              setGigs(json.data ?? json);
              setTotalGigCount(json.total ?? (json.data ?? json).length);
              return;
            }
          }
          flash("Session expired. Please sign out and sign in again.", "err");
        } else {
          flash("Failed to load gigs.", "err");
        }
        setGigs([]);
        setTotalGigCount(0);
      } else {
        const json = await res.json();
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
        g.numberOfMusicians
      );
      acc.totalGigs += 1;
      acc.totalEarnings += c.myEarnings;
      if (!g.paymentReceived) acc.pendingClientPayments += 1;
      if (!g.bandPaid) acc.outstandingToBand += c.amountOwedToOthers;
      return acc;
    },
    {
      totalGigs: 0,
      totalEarnings: 0,
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">
        <div className="w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 shadow-md">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome to <span className="text-brand-600">GigManager</span>
            </h1>
            <p className="mt-2 text-slate-600">Track your performances and manage payments</p>
          </div>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Gig<span className="text-brand-600">Manager</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">
              {session.user?.email}
            </div>
            <button
              onClick={() => {
                setEditGig(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Performance
            </button>
            <button
              onClick={async () => {
                await signOut();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* ── Summary Cards ──────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            label="Total Gigs"
            value={String(summary.totalGigs)}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
            }
            color="slate"
          />
          <SummaryCard
            label="My Earnings"
            value={formatCurrency(summary.totalEarnings)}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
            color="brand"
          />
          <SummaryCard
            label="Pending Payments"
            value={String(summary.pendingClientPayments)}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            }
            color="amber"
          />
          <SummaryCard
            label="Owe to Band"
            value={formatCurrency(summary.outstandingToBand)}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            }
            color="red"
          />
        </div>

        {/* ── Gig list ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : gigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 py-20 text-center">
            <svg className="mb-4 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-700">
              No performances yet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Add your first gig to start tracking.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Performance
            </button>
          </div>
        ) : (
          <div className="grid gap-5">
            {gigs.map((gig) => (
              <GigCard
                key={gig.id}
                gig={gig}
                onEdit={(g) => setEditGig(g)}
                onDelete={(g) => setDeleteGig(g)}
              />
            ))}
          </div>
        )}
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
    </div>
  );
}

// ── Summary Card sub-component ───────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: "slate" | "brand" | "amber" | "red";
}) {
  const palette = {
    slate: "bg-slate-50 text-slate-600",
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  const valuePalette = {
    slate: "text-slate-900",
    brand: "text-brand-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${palette[color]}`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${valuePalette[color]}`}>
        {value}
      </p>
    </div>
  );
}
