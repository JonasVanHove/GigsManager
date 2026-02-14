"use client";

import { useState } from "react";
import type { Gig } from "@/types";
import { useAuth } from "./AuthProvider";

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
  const [action, setAction] = useState<"payment" | "band" | "none">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedGigs = gigs.filter((g) => selectedIds.has(g.id));

  const handleBatchMarkPaid = async () => {
    if (selectedGigs.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");

      const updates = selectedGigs.map((gig) => ({
        id: gig.id,
        updates: {
          paymentReceived: true,
          paymentReceivedDate: new Date().toISOString(),
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

      const updates = selectedGigs.map((gig) => ({
        id: gig.id,
        updates: {
          bandPaid: true,
          bandPaidDate: new Date().toISOString(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 shadow-lg">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Bulk Actions
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Applying to {selectedGigs.length} gig{selectedGigs.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleBatchMarkPaid}
              disabled={loading}
              className="w-full rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
            >
              {loading ? "Updating..." : "✓ Mark as Payment Received"}
            </button>

            <button
              onClick={handleBatchMarkBandPaid}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
            >
              {loading ? "Updating..." : "✓ Mark Band as Paid"}
            </button>

            <button
              onClick={onClose}
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
