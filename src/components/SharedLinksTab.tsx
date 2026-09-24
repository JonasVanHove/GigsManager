"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Gig, ShareLinkItem, ShareLinkVisibility } from "@/types";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastContainer";
import { formatDate } from "@/lib/preferences";
import BandTag from "./BandTag";
import { Icons } from "./Icons";

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

/** Chip labels for the NON-financial fields a shared link can expose. */
const infoChipLabels: Array<{ key: keyof ShareLinkVisibility; label: string }> = [
  { key: "showEventName", label: "Event name" },
  { key: "showGigDate", label: "Gig date" },
  { key: "showBookingDate", label: "Booking date" },
  { key: "showVenuePerformers", label: "Venue / performers" },
  { key: "showNotes", label: "Notes" },
  { key: "showClientPaymentStatus", label: "Client payment" },
  { key: "showBandPaymentStatus", label: "Band payment" },
];

/** Chip labels for financial fields (suppressed while hide-all is on). */
const financialChipLabels: Array<{ key: keyof ShareLinkVisibility; label: string }> = [
  { key: "showPerformanceFee", label: "Performance fee" },
  { key: "showPerMusicianShare", label: "Per musician" },
  { key: "showManagerEarnings", label: "Manager earnings" },
  { key: "showManagerBonus", label: "Manager bonus" },
  { key: "showTechnicalFee", label: "Technical fee" },
  { key: "showTotalCost", label: "Total cost" },
];

/**
 * Compact visual snippet of what external viewers will actually see on the
 * public /share page — only the flags that are switched ON are rendered.
 */
function getVisibleShareChips(visibility?: ShareLinkVisibility): string[] {
  const v = visibility ?? DEFAULT_SHARE_LINK_VISIBILITY;
  const chips = infoChipLabels.filter(({ key }) => v[key]).map(({ label }) => label);
  if (!v.hideAllFinancialInformation) {
    chips.push(...financialChipLabels.filter(({ key }) => v[key]).map(({ label }) => label));
  }
  return chips;
}

type LinkViewMode = "grid" | "list";

interface ShareLinkCardProps {
  link: ShareLinkItem;
  viewMode: LinkViewMode;
  copied: boolean;
  revoking: boolean;
  deleting: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAccess: () => void;
}

function ShareLinkCard({
  link,
  viewMode,
  copied,
  revoking,
  deleting,
  onCopy,
  onEdit,
  onDelete,
  onToggleAccess,
}: ShareLinkCardProps) {
  const visibleChips = getVisibleShareChips(link.visibility);
  const isExpired = Boolean(link.isExpired);
  const selectionLabel =
    link.selectionMode === "all"
      ? "All gigs · auto-updates"
      : link.selectionMode === "artist"
        ? `${link.includeArtists?.length || 0} artist${link.includeArtists?.length === 1 ? "" : "s"} · auto-updates`
        : "Selected gigs";

  return (
    <article
      className={`group relative flex min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900/85 dark:hover:border-brand-800 dark:hover:shadow-2xl dark:hover:shadow-black/20 ${
        viewMode === "list" ? "flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]" : "flex-col"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-cyan-400 to-violet-500 ${
          isExpired ? "opacity-30 grayscale" : "opacity-100"
        }`}
      />

      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner transition duration-300 group-hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:group-hover:border-slate-600">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/90">
            <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden />
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            <span className="ml-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
              /share/{link.token.slice(0, 12)}…
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${isExpired ? "bg-amber-500" : "bg-emerald-500"}`} />
              {isExpired ? "Offline" : "Live"}
            </span>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-violet-800 to-slate-950 px-4 py-5 text-white">
            <div aria-hidden className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-200">
                  Shared performance overview
                </p>
                <h3 className="mt-1.5 line-clamp-2 text-lg font-black leading-tight text-white">
                  {link.title || "Untitled shared overview"}
                </h3>
                <p className="mt-2 truncate text-xs font-semibold text-slate-300">{selectionLabel}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                {link.gigCount} {link.gigCount === 1 ? "gig" : "gigs"}
              </span>
            </div>
            {link.selectionMode === "artist" && (
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {(link.includeArtists ?? []).slice(0, 4).map((artist) => (
                  <span key={artist} className="max-w-32 truncate rounded-full bg-white/10 px-2 py-1 text-[10px] text-slate-200">
                    {artist}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-h-12 flex-wrap content-start gap-1.5 px-3 py-2.5">
            {visibleChips.slice(0, 5).map((label) => (
              <span
                key={label}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {label}
              </span>
            ))}
            {visibleChips.length > 5 && (
              <span className="px-1 py-1 text-[10px] font-semibold text-slate-400">+{visibleChips.length - 5} more</span>
            )}
          </div>
        </div>
      </div>

      <aside
        className={`flex min-w-0 flex-col justify-between gap-4 border-t border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/35 sm:p-5 ${
          viewMode === "list" ? "lg:border-l lg:border-t-0" : ""
        }`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isExpired ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <Icons.Clock className="h-3 w-3" /> Expired
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <Icons.CheckCircle className="h-3 w-3" /> Active
              </span>
            )}
            {link.passwordProtected && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-black text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                <Icons.Lock className="h-3 w-3" /> Passcode Protected
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="font-semibold text-slate-400">Created</dt>
              <dd className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">
                {formatDate(link.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-400">Expires</dt>
              <dd className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">
                {link.expiresAt ? formatDate(link.expiresAt) : "Never"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-black text-white transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md disabled:opacity-60"
              aria-label={`Copy ${link.title || "shared link"} URL`}
            >
              {copied ? <Icons.Check className="h-3.5 w-3.5" /> : <Icons.Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={`/share/${link.token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
            >
              <Icons.ExternalLink className="h-3.5 w-3.5" /> Live preview
            </a>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Icons.Edit className="h-3.5 w-3.5" /> Edit access
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Icons.Trash className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/80">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">Link access</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {isExpired ? "Offline · recipients see an expiry notice" : "Live · recipients can open this URL"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!isExpired}
              aria-label={`${isExpired ? "Restore" : "Revoke"} ${link.title || "shared link"}`}
              onClick={onToggleAccess}
              disabled={revoking}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-offset-slate-900 ${
                isExpired ? "bg-slate-300 dark:bg-slate-700" : "bg-brand-600"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  isExpired ? "translate-x-1" : "translate-x-6"
                }`}
              />
            </button>
          </div>
        </div>
      </aside>
    </article>
  );
}

interface SharedLinksCollectionProps {
  loading: boolean;
  links: ShareLinkItem[];
  viewMode: LinkViewMode;
  copiedLinkId: string | null;
  revokingId: string | null;
  deletingId: string | null;
  activeCount: number;
  expiredCount: number;
  onViewModeChange: (mode: LinkViewMode) => void;
  onCreate: () => void;
  onCopy: (link: ShareLinkItem) => void;
  onEdit: (link: ShareLinkItem) => void;
  onDelete: (link: ShareLinkItem) => void;
  onToggleAccess: (link: ShareLinkItem) => void;
}

function SharedLinksCollection({
  loading,
  links,
  viewMode,
  copiedLinkId,
  revokingId,
  deletingId,
  activeCount,
  expiredCount,
  onViewModeChange,
  onCreate,
  onCopy,
  onEdit,
  onDelete,
  onToggleAccess,
}: SharedLinksCollectionProps) {
  return (
    <>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading shared links">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/70"
            />
          ))}
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-white/80 p-10 text-center dark:border-slate-700 dark:bg-slate-900/60 sm:p-14">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
            <Icons.Link className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-lg font-black text-slate-900 dark:text-white">No shared links yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
            Create a read-only page for selected gigs, artists, or your complete schedule.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-black text-white transition hover:bg-brand-700"
          >
            <Icons.Plus className="h-4 w-4" /> Create your first link
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-900/70">
            <p className="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {links.length} {links.length === 1 ? "link" : "links"} · {activeCount} active · {expiredCount} expired
            </p>
            <div
              role="group"
              aria-label="Shared link layout"
              className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-950"
            >
              {(["grid", "list"] as const).map((mode) => {
                const ModeIcon = mode === "grid" ? Icons.GridView : Icons.ListView;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onViewModeChange(mode)}
                    aria-pressed={viewMode === mode}
                    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold capitalize transition ${
                      viewMode === mode
                        ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                    }`}
                  >
                    <ModeIcon className="h-3.5 w-3.5" /> {mode}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                : "grid grid-cols-1 gap-4"
            }
          >
            {links.map((link) => (
              <ShareLinkCard
                key={link.id}
                link={link}
                viewMode={viewMode}
                copied={copiedLinkId === link.id}
                revoking={revokingId === link.id}
                deleting={deletingId === link.id}
                onCopy={() => onCopy(link)}
                onEdit={() => onEdit(link)}
                onDelete={() => onDelete(link)}
                onToggleAccess={() => onToggleAccess(link)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function SharedLinksTab() {
  const { getAccessToken } = useAuth();
  const toast = useToast();

  type GigSelectionMode = "all" | "artist" | "individual";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [linkViewMode, setLinkViewMode] = useState<LinkViewMode>("grid");
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

  const copyLink = async (linkId: string, token: string) => {
    try {
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(linkId);
      toast.success("Share link copied.");
      window.setTimeout(() => {
        setCopiedLinkId((current) => (current === linkId ? null : current));
      }, 2000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleToggleAccess = async (link: ShareLinkItem) => {
    const shouldRevoke = !link.isExpired;
    if (shouldRevoke) {
      const confirmed = window.confirm(
        "Revoke access to this share link? You can restore it later without deleting its settings."
      );
      if (!confirmed) return;
    }

    try {
      setRevokingId(link.id);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        toast.error("Unable to update share link. Please refresh your session.");
        return;
      }

      const response = await fetch(`/api/share-links/${link.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          expiresAt: shouldRevoke
            ? new Date(Date.now() - 60_000).toISOString()
            : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update link access");
      }

      setLinks((current) =>
        current.map((item) =>
          item.id === link.id
            ? {
                ...item,
                expiresAt: shouldRevoke ? new Date(Date.now() - 60_000).toISOString() : null,
                isExpired: shouldRevoke,
              }
            : item
        )
      );
      toast.success(shouldRevoke ? "Share link access revoked." : "Share link access restored.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update link access");
    } finally {
      setRevokingId(null);
    }
  };

  const linkStats = useMemo(
    () => ({
      active: links.filter((link) => !link.isExpired).length,
      expired: links.filter((link) => Boolean(link.isExpired)).length,
      protectedCount: links.filter((link) => link.passwordProtected).length,
    }),
    [links]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-brand-200/60 bg-gradient-to-br from-white via-white to-brand-50/70 p-4 shadow-sm dark:border-brand-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/30 sm:p-6">
        <div aria-hidden className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-brand-300/20 blur-3xl dark:bg-brand-500/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-900/20">
              <Icons.Link className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Shared links
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Create secure, read-only performance pages and control access without deleting their settings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-brand-900/15 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl sm:w-auto"
          >
            <Icons.Plus className="h-4 w-4" /> Create share link
          </button>
        </div>

        {links.length > 0 && (
          <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
            {[
              { label: "Total", value: links.length, icon: Icons.Link },
              { label: "Active", value: linkStats.active, icon: Icons.CheckCircle },
              { label: "Protected", value: linkStats.protectedCount, icon: Icons.Lock },
            ].map((stat) => {
              const StatIcon = stat.icon;
              return (
                <div key={stat.label} className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-2 dark:bg-slate-950/40 sm:px-3">
                  <StatIcon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950 dark:text-white">{stat.value}</p>
                    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {stat.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <SharedLinksCollection
        loading={loading}
        links={links}
        viewMode={linkViewMode}
        copiedLinkId={copiedLinkId}
        revokingId={revokingId}
        deletingId={deletingId}
        activeCount={linkStats.active}
        expiredCount={linkStats.expired}
        onViewModeChange={setLinkViewMode}
        onCreate={() => setShowCreateModal(true)}
        onCopy={(link) => copyLink(link.id, link.token)}
        onEdit={openEditModal}
        onDelete={(link) => handleDelete(link.id)}
        onToggleAccess={handleToggleAccess}
      />
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
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                            {artist}
                            {artistGigs.some(g => g.isCharity) && <span className="ml-1">💕</span>}
                            {artistGigs.some(g => g.isTentative) && <span className="ml-1">⏳</span>}
                          </span>
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
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                            {gig.eventName}
                            {gig.isCharity && <span className="ml-1">💕</span>}
                            {gig.isTentative && <span className="ml-1">⏳</span>}
                          </span>
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
