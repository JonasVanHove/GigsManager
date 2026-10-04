"use client";

/**
 * v1.39.0 — the "Export / Print Setlist" dropdown.
 *
 * Shared by the setlist editor and the gig card so the two entry points cannot
 * drift. When `items` is not supplied (the gig card has only a setlist id) the
 * setlist is fetched on demand, exactly like Stage Mode does.
 *
 * Print options are read at click time, not render time: the sheet is generated
 * when a layout is chosen, so a checkbox only updates state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateSetlistPrintHtml,
  openPrintView,
  type PlaybookDetails,
  type PrintableItem,
} from "@/lib/pdf-export";
import { useToast } from "./ToastContainer";
import { useAuth } from "./AuthProvider";

interface SetlistExportMenuProps {
  setlistId: string;
  /** Supplied by the editor, which already holds the draft in memory. */
  setlistName?: string;
  items?: PrintableItem[];
  playbook?: PlaybookDetails;
  /** Compact icon-only trigger for the dense gig-card action row. */
  compact?: boolean;
  isDutch?: boolean;
  className?: string;
}

const L = {
  trigger: ["Export / Print", "Exporteren / Afdrukken"],
  stage: ["Stage setlist", "Podiumsetlist"],
  playbook: ["Band & tech playbook", "Band & tech playbook"],
  showKey: ["Show song keys", "Tonarten tonen"],
  showBpm: ["Show BPM", "BPM tonen"],
  stageNotes: ["Stage notes (printed at the top)", "Podiumnotities"],
  close: ["Close", "Sluiten"],
  failed: ["Could not load this setlist.", "Kon deze setlist niet laden."],
} as const;

type CopyKey = keyof typeof L;

export default function SetlistExportMenu({
  setlistId,
  setlistName,
  items,
  playbook,
  compact = false,
  isDutch = false,
  className = "",
}: SetlistExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(true);
  const [showBpm, setShowBpm] = useState(true);
  const [stageNotes, setStageNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { getAccessToken } = useAuth();

  const t = useCallback((key: CopyKey) => L[key][isDutch ? 1 : 0], [isDutch]);

  // Close on an outside click or Escape. Without this the panel covers the
  // setlist and there is no obvious way back to it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const print = useCallback(
    async (layout: "stage" | "playbook") => {
      setOpen(false);
      try {
        let sourceItems = items;
        let name = setlistName;
        let extraPlaybook = playbook;

        if (!sourceItems) {
          setLoading(true);
          // Same authenticated fetch Stage Mode uses: the setlist routes are
          // behind requireAuth, so a bare fetch() comes back 401.
          const token = await getAccessToken();
          if (!token) throw new Error("no-session");
          const res = await fetch(`/api/setlists/${setlistId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`setlist fetch failed: ${res.status}`);
          const data = await res.json();
          sourceItems = (data.items ?? []) as PrintableItem[];
          name = name || data.title || data.naam || "";
          extraPlaybook = extraPlaybook ?? {
            bandName: data.band?.name ?? null,
            venueName: data.gigs?.[0]?.eventName ?? null,
            date: data.gigs?.[0]?.date ?? null,
          };
        }

        openPrintView(
          generateSetlistPrintHtml({
            setlistName: name || "Setlist",
            items: sourceItems ?? [],
            printOptions: { layout, showKey, showBpm, stageNotes },
            playbook: extraPlaybook,
          })
        );
      } catch (error) {
        console.error("[setlist-export] failed:", error);
        showToast({ message: t("failed"), type: "error" });
      } finally {
        setLoading(false);
      }
    },
    [items, setlistName, playbook, setlistId, showKey, showBpm, stageNotes, showToast, t, getAccessToken]
  );
const triggerClass = compact
    ? "rounded-lg p-2 text-slate-600 transition-all duration-200 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-700/40"
    : "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        data-testid="setlist-export-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={loading}
        className={triggerClass}
        title={t("trigger")}
      >
        <span aria-hidden>🖨️</span>
        {!compact && <span className="hidden md:inline">{t("trigger")}</span>}
      </button>

      {open && (
        <div
          role="menu"
          data-testid="setlist-export-menu"
          className="absolute right-0 z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Print options
          </p>

          <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              data-testid="export-toggle-key"
              checked={showKey}
              onChange={(e) => setShowKey(e.target.checked)}
              className="h-4 w-4"
            />
            {t("showKey")}
          </label>

          <label className="mb-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              data-testid="export-toggle-bpm"
              checked={showBpm}
              onChange={(e) => setShowBpm(e.target.checked)}
              className="h-4 w-4"
            />
            {t("showBpm")}
          </label>

          <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
            {t("stageNotes")}
            <textarea
              data-testid="export-stage-notes"
              value={stageNotes}
              onChange={(e) => setStageNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              placeholder="e.g. Hard out after the encore"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              role="menuitem"
              data-testid="export-stage-sheet"
              onClick={() => print("stage")}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-amber-500 dark:text-slate-900 dark:hover:bg-amber-400"
            >
              {t("stage")}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="export-playbook"
              onClick={() => print("playbook")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {t("playbook")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            {t("close")}
          </button>
        </div>
      )}
    </div>
  );
}
