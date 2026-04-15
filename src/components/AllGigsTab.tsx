"use client";

import { useState, useMemo, useDeferredValue, useEffect } from "react";
import type { Gig } from "@/types";
import GigCard from "./GigCard";
import BandTag from "./BandTag";

interface AllGigsTabProps {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  fmtCurrency: (amount: number) => string;
  loading: boolean;
}

type SortOption = "date-asc" | "date-desc" | "band-asc" | "band-desc" | "fee-high" | "fee-low" | "payment-status";

export default function AllGigsTab({
  gigs,
  onEdit,
  fmtCurrency,
  loading,
}: AllGigsTabProps) {
  const PAGE_SIZE = 24;
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredGigs = useDeferredValue(gigs);

  // Get all unique artists
  const artists = useMemo(() => {
    const unique = new Set<string>();
    deferredGigs.forEach((gig) => {
      if (gig.performers) unique.add(gig.performers);
    });
    return Array.from(unique).sort();
  }, [deferredGigs]);

  // Filter by selected artists
  const filteredGigs = useMemo(() => {
    if (selectedArtists.size === 0) return deferredGigs;
    return deferredGigs.filter((gig) => selectedArtists.has(gig.performers));
  }, [deferredGigs, selectedArtists]);

  // Sort
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
            (b.performanceFee + b.technicalFee) -
            (a.performanceFee + a.technicalFee)
        );
        break;
      case "fee-low":
        sorted.sort(
          (a, b) =>
            (a.performanceFee + a.technicalFee) -
            (b.performanceFee + b.technicalFee)
        );
        break;
      case "payment-status":
        sorted.sort((a, b) => {
          const aScore = (a.paymentReceived ? 2 : 0) + (a.bandPaid ? 1 : 0);
          const bScore = (b.paymentReceived ? 2 : 0) + (b.bandPaid ? 1 : 0);
          return bScore - aScore || new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        break;
    }

    return sorted;
  }, [filteredGigs, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortBy, selectedArtists, deferredGigs.length]);

  const visibleGigs = useMemo(
    () => sortedGigs.slice(0, visibleCount),
    [sortedGigs, visibleCount]
  );

  const remainingCount = Math.max(0, sortedGigs.length - visibleCount);

  const toggleArtist = (artist: string) => {
    const updated = new Set(selectedArtists);
    if (updated.has(artist)) {
      updated.delete(artist);
    } else {
      updated.add(artist);
    }
    setSelectedArtists(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="h-8 w-8 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (gigs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-20 text-center">
        <svg className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
        </svg>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
          No performances yet
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* -- Controls: Sort & Filter ---------------------------------------- */}
      <div className="space-y-4">
        {/* Sort dropdown */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Sort by
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="block w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="band-asc">Band A-Z</option>
            <option value="band-desc">Band Z-A</option>
            <option value="fee-high">Highest Fee</option>
            <option value="fee-low">Lowest Fee</option>
            <option value="payment-status">Payment Status</option>
          </select>
        </div>

        {/* Artist filter buttons */}
        {artists.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Filter by Artist
              </label>
              {selectedArtists.size > 0 && (
                <button
                  onClick={() => setSelectedArtists(new Set())}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {artists.map((artist) => (
                <button
                  key={artist}
                  onClick={() => toggleArtist(artist)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    selectedArtists.has(artist)
                      ? "bg-brand-600 text-white dark:bg-brand-500"
                      : "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 bg-white dark:bg-slate-800"
                  }`}
                >
                  <BandTag name={artist} variant={selectedArtists.has(artist) ? "solid" : "soft"} />
                  {selectedArtists.has(artist) && (
                    <svg className="ml-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* -- Results -------------------------------------------------------- */}
      <div className="space-y-1">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {sortedGigs.length} of {deferredGigs.length} performances
        </p>
      </div>

      {sortedGigs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 py-12 text-center">
          <svg className="mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10a4 4 0 018 0" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No performances match your filters
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5">
          {visibleGigs.map((gig) => (
            <GigCard
              key={gig.id}
              gig={gig}
              onEdit={onEdit}
              fmtCurrency={fmtCurrency}
              claimPerformanceFee={gig.claimPerformanceFee}
              claimTechnicalFee={gig.claimTechnicalFee}
            />
          ))}
          </div>

          {remainingCount > 0 && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Load more ({remainingCount} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
