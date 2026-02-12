"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import type { Investment, InvestmentFormData } from "@/types";

interface InvestmentsTabProps {
  fmtCurrency: (amount: number) => string;
}

export default function InvestmentsTab({ fmtCurrency }: InvestmentsTabProps) {
  const { session, getAccessToken } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InvestmentFormData>({
    amount: 0,
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Fetch investments ──────────────────────────────────────────────────
  const fetchInvestments = async () => {
    if (!session?.user) {
      setInvestments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();

      if (!token) {
        setLoading(false);
        setTimeout(fetchInvestments, 500);
        return;
      }

      const res = await fetch("/api/investments", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch investments");
      }

      const data = await res.json();
      setInvestments(data);
    } catch (err) {
      console.error("Fetch investments error:", err);
      setError("Failed to load investments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestments();
  }, [session?.user]);

  // ── Add investment ─────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.amount || form.amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("No token available");
      }

      const res = await fetch("/api/investments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create investment");
      }

      const newInvestment = await res.json();
      setInvestments([newInvestment, ...investments]);
      setForm({
        amount: 0,
        description: "",
        date: new Date().toISOString().split("T")[0],
      });
      setShowForm(false);
    } catch (err) {
      console.error("Add investment error:", err);
      setError(err instanceof Error ? err.message : "Failed to create investment");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete investment ──────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this investment?")) {
      return;
    }

    setDeleting(id);
    setError("");

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("No token available");
      }

      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete investment");
      }

      setInvestments(investments.filter((inv) => inv.id !== id));
    } catch (err) {
      console.error("Delete investment error:", err);
      setError("Failed to delete investment");
    } finally {
      setDeleting(null);
    }
  };

  // ── Calculate totals ───────────────────────────────────────────────────
  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Investments
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track expenses that reduce your net profit
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 dark:hover:bg-brand-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {showForm ? "Cancel" : "Add Investment"}
        </button>
      </div>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-6">
          <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">
            Add Investment
          </h4>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20"
                placeholder="0.00"
                value={form.amount || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20"
                placeholder="e.g., New sound equipment"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Date
              </label>
              <input
                type="date"
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 dark:hover:bg-brand-700"
            >
              {saving ? "Saving..." : "Save Investment"}
            </button>
          </div>
        </div>
      )}

      {/* ── Summary ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-brand-50 dark:from-brand-950/20 to-brand-50/50 dark:to-transparent p-4">
        <div className="text-center">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Total Invested
          </p>
          <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
            {fmtCurrency(totalInvested)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {investments.length} {investments.length === 1 ? "investment" : "investments"}
          </p>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : investments.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0M9.75 17.25c0 .552-.448 1-1 1H5.625c-.552 0-1-.448-1-1m12.621-4.47c.409-.34.659-.934.659-1.591v-2.64c0-1.228-.841-2.265-1.964-2.565A6.521 6.521 0 0 0 12 2.25c-1.466 0-2.869.36-4.095 1.001C6.041 3.476 5.2 4.513 5.2 5.74v2.637c0 .657.25 1.251.659 1.591m0 0c.409.34 1.227.855 2.966 1.694C9.75 15.75 11.565 16.5 12 16.5c.435 0 2.25-.75 3.175-1.32 1.738-.839 2.557-1.354 2.966-1.694" />
          </svg>
          <h3 className="mt-4 font-semibold text-slate-700 dark:text-slate-300">
            No investments yet
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add your first investment to track expenses
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-4 py-3 transition hover:shadow-md dark:hover:shadow-slate-900/20"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-slate-900 dark:text-white">
                    {inv.description || "Investment"}
                  </h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(inv.date).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-lg font-bold text-brand-600 dark:text-brand-400">
                    {fmtCurrency(inv.amount)}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(inv.id)}
                  disabled={deleting === inv.id}
                  className="rounded-lg p-2 text-slate-400 dark:text-slate-600 transition hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                  title="Delete investment"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
