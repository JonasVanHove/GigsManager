"use client";

import { useState } from "react";
import type { Gig } from "@/types";
import { useAuth } from "./AuthProvider";
import { useModalLock } from "@/hooks/useModalLock";

interface BulkEditorProps {
  gigs: Gig[];
  selectedIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkEditor({
  gigs,
  selectedIds,
  onClose,
  onSuccess,
}: BulkEditorProps) {
  const { getAccessToken } = useAuth();
  const { handleBackdropClick, handleTouchStart, handleTouchEnd } = useModalLock({
    onClose,
  });
  const [action, setAction] = useState<"payment" | "band" | "none">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [useCustomDate, setUseCustomDate] = useState(false);

  const selectedGigs = gigs.filter((g) => selectedIds.has(g.id));
  const today = new Date().toISOString().split("T")[0];
  const displayDate = useCustomDate ? customDate : today;

  const handleBatchMarkPaid = async () => {
    if (selectedGigs.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");

      const dateToUse = useCustomDate && customDate ? new Date(customDate).toISOString() : new Date().toISOString();

      const updates = selectedGigs.map((gig) => ({
        id: gig.id,
        updates: {
          paymentReceived: true,
          paymentReceivedDate: dateToUse,
        },
      }));

      const response = await fetch("/api/gigs/bulk-update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update gigs");
      }

      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchMarkBandPaid = async () => {
    if (selectedGigs.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");

      const dateToUse = useCustomDate && customDate ? new Date(customDate).toISOString() : new Date().toISOString();

      const updates = selectedGigs.map((gig) => ({
        id: gig.id,
        updates: {
          bandPaid: true,
          bandPaidDate: dateToUse,
        },
      }));

      const response = await fetch("/api/gigs/bulk-update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update gigs");
      }

      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="modal-sheet-mobile w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl border border-slate-200/50 bg-white/95 dark:border-slate-700/50 dark:bg-slate-800/95 backdrop-blur shadow-2xl sm:rounded-2xl modal-content-enter">
        <div className="border-b border-slate-200/50 dark:border-slate-700/50 px-6 py-5 bg-gradient-to-r from-slate-50/70 to-slate-100/40 dark:from-slate-800/40 dark:to-slate-800/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Bulk Actions
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Applying to {selectedGigs.length} gig{selectedGigs.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200/50 bg-red-50/70 backdrop-blur px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Date Override Section */}
          <div className="mb-4 rounded-lg border border-slate-200/50 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-800/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="useCustomDate"
                checked={useCustomDate}
                onChange={(e) => setUseCustomDate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
              />
              <label htmlFor="useCustomDate" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Use custom payment date
              </label>
            </div>
            
            {!useCustomDate ? (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50 px-3 py-2 rounded">
                <span className="text-slate-500">→</span>
                <span>Will set payment date to <strong>{today}</strong> (today)</span>
              </div>
            ) : (
              <div>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20"
                />
                {customDate && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 rounded">
                    <span className="text-slate-500">→</span>
                    <span>Will set payment date to <strong>{customDate}</strong></span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleBatchMarkPaid}
              disabled={loading}
              className="touch-target inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 px-4 py-3 text-sm font-medium text-white shadow-md transition-all duration-200"
            >
              {loading ? "Updating..." : "✓ Mark as Client Paid"}
            </button>

            <button
              onClick={handleBatchMarkBandPaid}
              disabled={loading}
              className="touch-target inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 px-4 py-3 text-sm font-medium text-white shadow-md transition-all duration-200"
            >
              {loading ? "Updating..." : "✓ Mark as Band Paid"}
            </button>

            <button
              onClick={onClose}
              disabled={loading}
              className="touch-target inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300/50 dark:border-slate-600/50 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-700/40 backdrop-blur hover:bg-slate-50/80 dark:hover:bg-slate-700/60 transition-all duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
