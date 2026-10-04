"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { useImmersiveMode } from "@/lib/use-immersive-mode";
import { useWakeLock } from "@/lib/use-mobile-features";
import {
  computeStageTiming,
  findTuningAlerts,
  formatDuration,
  isOverrun,
  nextIndex,
  nextSongIndex,
  normaliseStageItems,
  positionLabel,
  previousIndex,
  previousSongIndex,
  resolveActiveIndex,
  type RawSetlistItem,
  type StageItem,
} from "@/lib/stage-mode";

export interface StageModeProps {
  gigId: string;
  gigName: string;
  gigVenue?: string | null;
  setlistId: string | null;
  isDutch?: boolean;
  onClose: () => void;
}

/** Ticks often enough that the seconds digit never looks frozen on stage. */
const CLOCK_INTERVAL_MS = 500;

const COPY = {
  nl: {
    attendance: "Aanwezigheid",
    remaining: "Resterend",
    total: "Totaal",
    noSetlist: "Geen setlist gekoppeld aan dit optreden.",
    loadFailed: "Setlist kon niet worden geladen.",
    next: "Volgende",
    prev: "Vorige",
    nowPlaying: "Nu",
    upNext: "Daarna",
    close: "Sluiten",
    fullscreen: "Volledig scherm",
    wakeLock: "Scherm blijft aan",
    retune: "Herstem",
    overrun: "Over de tijd",
  },
  en: {
    attendance: "Attendance",
    remaining: "Remaining",
    total: "Total",
    noSetlist: "No setlist is attached to this gig.",
    loadFailed: "Could not load the setlist.",
    next: "Next",
    prev: "Previous",
    nowPlaying: "Now",
    upNext: "Up next",
    close: "Close",
    fullscreen: "Full screen",
    wakeLock: "Screen stays on",
    retune: "Retune",
    overrun: "Over time",
  },
} as const;

/**
 * Stage Mode (v1.38.0): the on-stage view of a gig's setlist.
 *
 * Designed for a dark stage: near-black background, large type, and controls
 * big enough to hit without looking. The setlist is fetched on mount rather
 * than passed in as a prop, so the trigger on a gig card stays a one-liner.
 */
export default function StageMode({
  gigId,
  gigName,
  gigVenue,
  setlistId,
  isDutch = false,
  onClose,
}: StageModeProps) {
  const { getAccessToken } = useAuth();
  const { requestFullscreen, exitFullscreen } = useImmersiveMode();
  const { requestWakeLock, isSupported: wakeLockSupported } = useWakeLock();

  const [items, setItems] = useState<StageItem[]>([]);
  const [loading, setLoading] = useState(Boolean(setlistId));
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [wakeLockActive, setWakeLockActive] = useState(false);

  /** Captured on mount so the clock counts the set, not the page load. */
  const startedAtRef = useRef<number>(Date.now());
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  const copy = isDutch ? COPY.nl : COPY.en;
  // Hoisted to a primitive so the fetch effect depends on the string itself
  // rather than on the `copy` object, which eslint treats as unstable.
  const loadFailed = copy.loadFailed;

  useEffect(() => {
    if (!setlistId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("no-session");
        const res = await fetch(`/api/setlists/${setlistId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`status-${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        setItems(normaliseStageItems(body?.items as RawSetlistItem[]));
        setError(null);
      } catch {
        if (!cancelled) setError(loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setlistId, getAccessToken, loadFailed]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const timing = useMemo(
    () => computeStageTiming({ startedAtMs: startedAtRef.current, nowMs, items }),
    [nowMs, items]
  );

  const alerts = useMemo(() => findTuningAlerts(items), [items]);
  const active = resolveActiveIndex(items, activeIndex);
const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    if (!lock) return;
    try {
      await lock.release();
    } catch {
      // Releasing an already-released lock is not worth surfacing.
    }
    wakeLockRef.current = null;
    setWakeLockActive(false);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    const lock = await requestWakeLock();
    if (lock) {
      wakeLockRef.current = lock;
      setWakeLockActive(true);
    }
  }, [requestWakeLock, wakeLockSupported]);

  // The browser drops the screen wake lock whenever the page hides, so it is
  // re-acquired on the way back. Without this, the first time a musician
  // switches away from the tab Stage Mode quietly becomes a sleep timer.
  useEffect(() => {
    void acquireWakeLock();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void acquireWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseWakeLock();
    };
  }, [acquireWakeLock, releaseWakeLock]);

  const goTo = useCallback((index: number | null) => {
    if (index === null) return;
    setActiveIndex(index);
  }, []);

  const goNext = useCallback(
    () => goTo(nextIndex(items, activeIndex)),
    [goTo, items, activeIndex]
  );
  const goPrev = useCallback(
    () => goTo(previousIndex(items, activeIndex)),
    [goTo, items, activeIndex]
  );
  // Skips trailing notes so these land on a real song, not a break.
  const goNextSong = useCallback(
    () => goTo(nextSongIndex(items, activeIndex)),
    [goTo, items, activeIndex]
  );
  const goPrevSong = useCallback(
    () => goTo(previousSongIndex(items, activeIndex)),
    [goTo, items, activeIndex]
  );

  // Keep the active row in view when navigating from the transport controls.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);

  const closeStage = useCallback(async () => {
    await releaseWakeLock();
    try {
      await exitFullscreen();
    } catch {
      // Not in fullscreen, or the browser refused; the stage still closes.
    }
    onClose();
  }, [releaseWakeLock, exitFullscreen, onClose]);

  // Bound on the document: the stage fills the viewport and may never hold DOM
  // focus, so a keydown handler on a wrapper div would never fire.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeStage();
      } else if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeStage, goNext, goPrev]);

  const elapsed = formatDuration(timing.elapsedMs);
  const remaining = formatDuration(timing.remainingMs);
  const total = formatDuration(timing.totalMs);
  const nextUp =
    active >= 0 && active + 1 < items.length ? items[active + 1] : null;
  const overrun = isOverrun(timing);
  // Rendered into <body>, not inline.
  //
  // This overlay is mounted from inside a gig card, and a card is not a neutral
  // parent: any ancestor with a transform, filter or containment makes
  // `position: fixed` resolve against that ancestor instead of the viewport, so
  // the card's own content paints over the stage and swallows taps. On Safari
  // that left songs unselectable. Portalling drops the card from the
  // containing-block chain entirely.
  if (typeof document === "undefined") return null;

  if (loading) {
    return createPortal(
      <div
        data-testid="stage-mode"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black text-white"
      >
        <p className="text-xl text-slate-300">{isDutch ? "Laden…" : "Loading…"}</p>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      data-testid="stage-mode"
      data-gig-id={gigId}
      className="fixed inset-0 z-[9999] flex flex-col bg-neutral-950 text-white"
    >
      {/* Header: who, where, how long. */}
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <h1
            data-testid="stage-gig-name"
            className="truncate text-2xl font-black tracking-tight sm:text-4xl"
          >
            {gigName}
          </h1>
          {gigVenue && (
            <p className="mt-1 truncate text-sm text-slate-400 sm:text-lg">
              {gigVenue}
            </p>
          )}
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400 sm:text-sm">
            {copy.attendance} · {positionLabel(items, active) || "—"}
          </p>
        </div>

        {/* Elapsed is the big clock: it is read at arm's length. */}
        <div className="text-right">
          <div
            data-testid="stage-clock"
            className="font-mono text-5xl font-black tabular-nums leading-none sm:text-7xl"
          >
            {elapsed.text}
          </div>
          <div className="mt-2 flex justify-end gap-4 font-mono text-sm tabular-nums sm:text-base">
            <span data-testid="stage-remaining" className="text-slate-300">
              {copy.remaining} {remaining.text}
            </span>
            <span className="text-slate-500">
              {copy.total} {total.text}
            </span>
          </div>
        </div>
      </header>

      <div className="h-1.5 shrink-0 bg-white/10">
        <div
          data-testid="stage-progress"
          className={`h-full transition-[width] duration-500 ${overrun ? "bg-red-500" : "bg-amber-400"}`}
          style={{ width: `${timing.progressPct}%` }}
        />
      </div>
      {overrun && (
        <p
          data-testid="stage-overrun"
          className="shrink-0 bg-red-600 px-5 py-1 text-center text-sm font-bold uppercase tracking-wider"
        >
          {copy.overrun}
        </p>
      )}

      {/* Setlist */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6">
        {items.length === 0 ? (
          <p
            data-testid="stage-empty"
            className="px-2 py-10 text-center text-lg text-slate-400"
          >
            {error ?? copy.noSetlist}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="stage-setlist">
            {items.map((item, index) => {
              const isActive = index === active;
              const isNext = index === active + 1;
              const hasAlert = alerts.has(index);
              const isNote = item.type === "note";

              return (
                <li key={item.id} ref={isActive ? activeRowRef : null}>
                  <button
                    type="button"
                    data-testid={`stage-item-${index}`}
                    data-active={isActive}
                    data-next={isNext}
                    onClick={() => setActiveIndex(index)}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex w-full min-h-[72px] items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors sm:min-h-[88px] sm:px-6 ${
                      isActive
                        ? "bg-amber-400 text-neutral-950"
                        : isNext
                        ? "bg-white/15 text-white ring-1 ring-white/20"
                        : isNote
                        ? "bg-white/5 text-slate-300"
                        : "bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`w-10 shrink-0 text-center font-mono text-2xl font-black sm:w-12 sm:text-3xl ${
                        isActive ? "text-neutral-950" : "text-slate-500"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-black sm:text-3xl">
                          {item.title}
                        </span>
                        {isNote && (
                          <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            Note
                          </span>
                        )}
                        {hasAlert && (
                          <span
                            data-testid={`stage-retune-${index}`}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isActive
                                ? "bg-red-700 text-white"
                                : "bg-red-500/25 text-red-200"
                            }`}
                          >
                            {copy.retune}
                          </span>
                        )}
                      </span>
{(item.key || item.bpm !== null || item.tuning) && (
                        <span className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm sm:text-lg">
                          {item.key && (
                            <span
                              data-testid={`stage-key-${index}`}
                              className={`rounded px-2 py-0.5 font-bold ${
                                isActive
                                  ? "bg-neutral-950 text-amber-300"
                                  : "bg-white/10 text-amber-300"
                              }`}
                            >
                              {item.key}
                            </span>
                          )}
                          {item.bpm !== null && (
                            <span className={isActive ? "text-neutral-800" : "text-slate-400"}>
                              {item.bpm} BPM
                            </span>
                          )}
                          {item.tuning && (
                            <span className={isActive ? "text-neutral-800" : "text-slate-500"}>
                              {item.tuning}
                            </span>
                          )}
                        </span>
                      )}

                      {item.notes && (
                        <span
                          data-testid={`stage-notes-${index}`}
                          className={`mt-1 block truncate text-sm ${
                            isActive ? "text-neutral-800" : "text-slate-400"
                          }`}
                        >
                          {item.notes}
                        </span>
                      )}
                    </span>

                    <span className="shrink-0 text-right">
                      {isActive && (
                        <span
                          data-testid="stage-now-playing"
                          className="block rounded bg-neutral-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-300"
                        >
                          {copy.nowPlaying}
                        </span>
                      )}
                      {isNext && !isActive && (
                        <span
                          data-testid="stage-up-next"
                          className="block text-xs font-bold uppercase tracking-widest text-amber-300"
                        >
                          {copy.upNext}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Transport */}
      <footer className="shrink-0 border-t border-white/10 px-4 py-4 sm:px-8">
        {nextUp && (
          <p
            data-testid="stage-next-cue"
            className="mb-3 truncate text-center text-sm text-slate-400"
          >
            {copy.upNext}:{" "}
            <span className="font-bold text-amber-300">{nextUp.title}</span>
          </p>
        )}

        <div className="flex items-stretch justify-center gap-3">
          <button
            type="button"
            data-testid="stage-prev"
            onClick={goPrev}
            className="min-h-[64px] min-w-[88px] rounded-2xl bg-white/10 px-5 text-lg font-bold hover:bg-white/20"
          >
            ‹ {copy.prev}
          </button>
          <button
            type="button"
            data-testid="stage-next"
            onClick={goNext}
            className="min-h-[64px] min-w-[88px] rounded-2xl bg-amber-400 px-5 text-lg font-black text-neutral-950 hover:bg-amber-300"
          >
            {copy.next} ›
          </button>
          <button
            type="button"
            data-testid="stage-exit"
            onClick={() => void closeStage()}
            className="min-h-[64px] min-w-[88px] rounded-2xl bg-red-600 px-5 text-lg font-bold hover:bg-red-700"
          >
            {copy.close}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500">
          <button
            type="button"
            data-testid="stage-fullscreen"
            onClick={() => void requestFullscreen()}
            className="rounded px-2 py-1 hover:text-white"
          >
            {copy.fullscreen}
          </button>
          {wakeLockSupported && (
            <span data-testid="stage-wakelock" data-active={wakeLockActive}>
              {copy.wakeLock}
              {wakeLockActive ? " ✓" : ""}
            </span>
          )}
        </div>
      </footer>
    </div>,
    document.body
  );
}
