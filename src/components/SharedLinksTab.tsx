"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Gig, ShareLinkItem, ShareLinkVisibility } from "@/types";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastContainer";
import { formatDate } from "@/lib/preferences";
import BandTag from "./BandTag";

const DEFAULT_SHARE_LINK_VISIBILITY: ShareLinkVisibility = {
  showEventName: true,
  showGigDate: true,
  showBookingDate: false,
  showVenuePerformers: true,
  showNotes: false,
  showPerformanceFee: false,
  showPerMusicianShare: false,
  showManagerEarnings: false,
  showManagerBonus: false,
  showTechnicalFee: false,
  showTotalCost: false,
  showClientPaymentStatus: false,
  showBandPaymentStatus: false,
  hideAllFinancialInformation: true,
};

const baseInputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

const visibilityGroups: Array<{
  title: string;
  items: Array<{ key: keyof ShareLinkVisibility; label: string; financial?: boolean }>;
}> = [
  {
    title: "Gig Information",
    items: [
      { key: "showEventName", label: "Show event name" },
      { key: "showGigDate", label: "Show gig date" },
      { key: "showBookingDate", label: "Show booking date" },
      { key: "showVenuePerformers", label: "Show venue / performers" },
      { key: "showNotes", label: "Show notes" },
    ],
  },
  {
    title: "Financial Data",
    items: [
      { key: "showPerformanceFee", label: "Show performance fee", financial: true },
      { key: "showPerMusicianShare", label: "Show per musician share", financial: true },
      { key: "showManagerEarnings", label: "Show manager earnings", financial: true },
      { key: "showManagerBonus", label: "Show manager bonus", financial: true },
      { key: "showTechnicalFee", label: "Show technical fee", financial: true },
      { key: "showTotalCost", label: "Show total cost", financial: true },
    ],
  },
  {
    title: "Payment Status",
    items: [
      { key: "showClientPaymentStatus", label: "Show client payment status" },
      { key: "showBandPaymentStatus", label: "Show band payment status" },
    ],
  },
];

export default function SharedLinksTab() {
  const { getAccessToken } = useAuth();
  const toast = useToast();

  type GigSelectionMode = "all" | "artist" | "individual";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLinkItem[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [selectionMode, setSelectionMode] = useState<GigSelectionMode>("individual");
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const [selectedGigIds, setSelectedGigIds] = useState<Set<string>>(new Set());
  const [visibility, setVisibility] =
    useState<ShareLinkVisibility>(DEFAULT_SHARE_LINK_VISIBILITY);

  const sortedGigs = useMemo(
    () => [...gigs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [gigs]
  );

  const gigsByArtist = useMemo(() => {
    const map = new Map<string, Gig[]>();
    for (const gig of sortedGigs) {
      const artist = gig.performers?.trim() || "Unknown Artist";
      const existing = map.get(artist) ?? [];
      existing.push(gig);
      map.set(artist, existing);
    }
    return map;
  }, [sortedGigs]);

  const allGigIds = useMemo(() => sortedGigs.map((gig) => gig.id), [sortedGigs]);

  const effectiveSelectedGigIds = useMemo(() => {
    if (selectionMode === "all") {
      return new Set(allGigIds);
    }

    if (selectionMode === "artist") {
      const ids = new Set<string>();
      selectedArtists.forEach((artist) => {
        const artistGigs = gigsByArtist.get(artist);
        if (!artistGigs) return;
        artistGigs.forEach((gig) => {
          ids.add(gig.id);
        });
      });
      return ids;
    }

    return selectedGigIds;
  }, [selectionMode, allGigIds, gigsByArtist, selectedArtists, selectedGigIds]);

  const selectedCount = effectiveSelectedGigIds.size;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) {
        toast.error("Unable to fetch share links. Please refresh your session.");
        return;
      }

      const [linksRes, gigsRes] = await Promise.all([
        fetch("/api/share-links", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/gigs?take=300&skip=0", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!linksRes.ok || !gigsRes.ok) {
        throw new Error("Failed to load shared links data");
      }

      const linksData = (await linksRes.json()) as ShareLinkItem[];
      const gigsData = await gigsRes.json();

      setLinks(Array.isArray(linksData) ? linksData : []);
      setGigs(Array.isArray(gigsData) ? gigsData : gigsData.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setTitle("");
    setExpiresAt("");
    setPassword("");
    setClearPassword(false);
    setSelectionMode("individual");
    setSelectedArtists(new Set());
    setSelectedGigIds(new Set());
    setVisibility(DEFAULT_SHARE_LINK_VISIBILITY);
  };

  const openEditModal = (link: ShareLinkItem) => {
    setEditingLinkId(link.id);
    setTitle(link.title || "");
    setExpiresAt(link.expiresAt ? new Date(link.expiresAt).toISOString().split("T")[0] : "");
    setPassword("");
    setClearPassword(false);
    setVisibility(link.visibility || DEFAULT_SHARE_LINK_VISIBILITY);
    setShowEditModal(true);
  };

  const toggleGig = (gigId: string) => {
    setSelectedGigIds((prev) => {
      const next = new Set(prev);
      if (next.has(gigId)) {
        next.delete(gigId);
      } else {
        next.add(gigId);
      }
      return next;
    });
  };

  const toggleArtist = (artist: string) => {
    setSelectedArtists((prev) => {
      const next = new Set(prev);
      if (next.has(artist)) {
        next.delete(artist);
      } else {
        next.add(artist);
      }
      return next;
    });
  };

  const toggleVisibility = (key: keyof ShareLinkVisibility) => {
    setVisibility((prev) => {
      const next: ShareLinkVisibility = {
        ...prev,
        [key]: !prev[key],
      };

      if (key === "hideAllFinancialInformation" && next.hideAllFinancialInformation) {
        next.showPerformanceFee = false;
        next.showPerMusicianShare = false;
        next.showManagerEarnings = false;
        next.showManagerBonus = false;
        next.showTechnicalFee = false;
        next.showTotalCost = false;
      }

      if (
        key !== "hideAllFinancialInformation" &&
        [
          "showPerformanceFee",
          "showPerMusicianShare",
          "showManagerEarnings",
          "showManagerBonus",
          "showTechnicalFee",
          "showTotalCost",
        ].includes(key)
      ) {
        next.hideAllFinancialInformation = false;
      }

      return next;
    });
  };

  const handleCreate = async () => {
    if (effectiveSelectedGigIds.size === 0) {
      toast.error("Select at least one gig to share.");
      return;
    }

    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) {
        toast.error("Unable to create share link. Please refresh your session.");
        return;
      }

      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim() || null,
          expiresAt: expiresAt || null,
          password: password.trim() || null,
          gigIds: Array.from(effectiveSelectedGigIds),
          selectionMode,
          selectedArtists: selectionMode === "artist" ? Array.from(selectedArtists) : [],
          visibility,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create share link");
      }

      toast.success("Share link created successfully.");
      setShowCreateModal(false);
      resetForm();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create share link";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    const confirmed = window.confirm("Delete this shared link?");
    if (!confirmed) return;

    try {
      setDeletingId(linkId);
      const token = await getAccessToken();
      if (!token) {
        toast.error("Unable to delete share link. Please refresh your session.");
        return;
      }

      const res = await fetch(`/api/share-links/${linkId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete share link");
      }

      setLinks((prev) => prev.filter((link) => link.id !== linkId));
      toast.success("Share link deleted.");
    } catch {
      toast.error("Failed to delete share link.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!editingLinkId) return;

    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) {
        toast.error("Unable to update share link. Please refresh your session.");
        return;
      }

      const res = await fetch(`/api/share-links/${editingLinkId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim() || null,
          expiresAt: expiresAt || null,
          password: password.trim() || null,
          clearPassword,
          visibility,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update share link");
      }

      toast.success("Share link permissions updated.");
      setShowEditModal(false);
      setEditingLinkId(null);
      resetForm();
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update share link";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied.");
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-brand-200/60 bg-gradient-to-br from-white to-brand-50/40 p-4 shadow-sm dark:border-brand-900/40 dark:from-slate-900 dark:to-brand-950/20 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Shared Links</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create secure, read-only links for selected gigs.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Create Share Link
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Loading shared links...
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-sm text-slate-600 dark:text-slate-400">No shared links yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <article
              key={link.id}
              className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                    📎 {link.title || "Untitled Shared Overview"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Created: {formatDate(link.createdAt)} • Expires: {link.expiresAt ? formatDate(link.expiresAt) : "Never"} • Gigs: {link.gigCount}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {link.passwordProtected && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">🔒 Password protected</span>
                    )}
                    {link.isExpired && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Expired</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => openEditModal(link)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Edit permissions
                  </button>
                  <button
                    onClick={() => copyLink(link.token)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Copy link
                  </button>
                  <a
                    href={`/share/${link.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Preview
                  </a>
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {deletingId === link.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-6 sm:px-6 sm:py-10">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Create Share Link</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">Select gigs and exactly what recipients can see.</p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Basic Settings</h5>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title (optional)</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Musicians Overview"
                    className={baseInputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Expiration date (optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className={baseInputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Password (optional)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set password protection"
                    className={baseInputClass}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Select Gigs</h5>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{selectedCount} selected</span>
                </div>
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setSelectionMode("all")}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      selectionMode === "all"
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-300"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    All gigs
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode("artist")}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      selectionMode === "artist"
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-300"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    By artist
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode("individual")}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      selectionMode === "individual"
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-300"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    Individual gigs
                  </button>
                </div>

                {selectionMode !== "individual" && (
                  <p className="mb-2 text-xs text-brand-700 dark:text-brand-300">
                    New gigs will be auto-included for this link.
                  </p>
                )}

                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {sortedGigs.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No gigs found.</p>
                  ) : selectionMode === "all" ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                      All gigs will be shared ({sortedGigs.length} total).
                    </div>
                  ) : selectionMode === "artist" ? (
                    Array.from(gigsByArtist.entries()).map(([artist, artistGigs]) => (
                      <label
                        key={artist}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/80"
                      >
                        <input
                          type="checkbox"
                          checked={selectedArtists.has(artist)}
                          onChange={() => toggleArtist(artist)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{artist}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {artistGigs.length} gig{artistGigs.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </label>
                    ))
                  ) : (
                    sortedGigs.map((gig) => (
                      <label
                        key={gig.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/80"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGigIds.has(gig.id)}
                          onChange={() => toggleGig(gig.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{gig.eventName}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(gig.date)} • {gig.performers && <BandTag name={gig.performers} variant="soft" />}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Visibility Settings</h5>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={visibility.hideAllFinancialInformation}
                    onChange={() => toggleVisibility("hideAllFinancialInformation")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Hide all financial information
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibilityGroups.map((group) => (
                  <div key={group.title} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group.title}</p>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={visibility[item.key]}
                            onChange={() => toggleVisibility(item.key)}
                            disabled={Boolean(item.financial && visibility.hideAllFinancialInformation)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 disabled:opacity-50"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-6 sm:px-6 sm:py-10">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Share Link</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">Update permissions and access settings.</p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingLinkId(null);
                  resetForm();
                }}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <section className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Basic Settings</h5>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title (optional)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Musicians Overview"
                  className={baseInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Expiration date (optional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={baseInputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Set new password (optional)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty to keep current password"
                  className={baseInputClass}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={clearPassword}
                    onChange={(e) => setClearPassword(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Remove password protection
                </label>
              </div>
            </section>

            <section className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Visibility Settings</h5>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={visibility.hideAllFinancialInformation}
                    onChange={() => toggleVisibility("hideAllFinancialInformation")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Hide all financial information
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibilityGroups.map((group) => (
                  <div key={group.title} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group.title}</p>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={visibility[item.key]}
                            onChange={() => toggleVisibility(item.key)}
                            disabled={Boolean(item.financial && visibility.hideAllFinancialInformation)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 disabled:opacity-50"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingLinkId(null);
                  resetForm();
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePermissions}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
