/**
 * Stage Mode timing and setlist logic (v1.38.0).
 *
 * Kept out of the React component on purpose: the interesting decisions here
 * are "what time is it", "which song is next" and "does this song need a
 * retune", and all of them are pure functions of their input. That makes them
 * testable without a browser, a clock or a stage.
 */

/** A row as the API returns it from GET /api/setlists/[id]. */
export interface RawSetlistItem {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  notes?: string | null;
  chords?: string | null;
  tuning?: string | null;
  keySignature?: string | null;
  bpm?: number | null;
}

/** A row as Stage Mode displays it. */
export interface StageItem {
  id: string;
  /** "song" or "note" — notes are spoken breaks, not songs. */
  type: "song" | "note";
  title: string;
  /** Key signature, e.g. "Am" or "G#m". Empty string when unknown. */
  key: string;
  /** Tempo in BPM, or null when the setlist does not record one. */
  bpm: number | null;
  notes: string;
  tuning: string;
  chords: string;
}

/** Fallback title for a marker with no title, so a row is never blank. */
export const UNTITLED_LABEL = "Untitled";

/** Same tuning string means the instrument stays as it is. */
function sameTuning(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Turns raw setlist rows into display rows.
 *
 * Blank rows are dropped: on stage a row with no title and no notes is noise,
 * and it would otherwise show up as a blank "Untitled" row mid-set.
 */
export function normaliseStageItems(
  raw: RawSetlistItem[] | null | undefined
): StageItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const bpm = Number(item.bpm);
      return {
        id: item.id || `stage-${index}`,
        type: item.type === "note" ? ("note" as const) : ("song" as const),
        title: (item.title || "").trim() || UNTITLED_LABEL,
        key: (item.keySignature || "").trim(),
        // Matches the API's own guard: anything outside 1..399 is nonsense.
        bpm: Number.isFinite(bpm) && bpm > 0 && bpm < 400 ? Math.round(bpm) : null,
        notes: (item.notes || "").trim(),
        tuning: (item.tuning || "").trim(),
        chords: (item.chords || "").trim(),
      };
    })
    .filter(
      (item) =>
        item.title !== UNTITLED_LABEL ||
        item.notes !== "" ||
        item.tuning !== "" ||
        item.chords !== ""
    );
}

/**
 * Indices of songs that start on a different tuning from the previous song.
 *
 * This is the most useful on-stage alert: a mid-set retune nobody mentioned is
 * how a band loses tempo, and the setlist editor already treats it as
 * noteworthy.
 */
export function findTuningAlerts(items: StageItem[]): Set<number> {
  const alerts = new Set<number>();

  items.forEach((item, index) => {
    if (index === 0) return;
    const previous = items[index - 1];
    // Only a real change between two known tunings is an alert. An unknown
    // tuning ("", "Onbekend") is not a retune, it is just missing data.
    if (!item.tuning || !previous.tuning) return;
    if (sameTuning(item.tuning, previous.tuning)) return;
    alerts.add(index);
  });

  return alerts;
}

/** Clamps an index into the list; an empty list has no active row. */
export function resolveActiveIndex(items: StageItem[], index: number): number {
  if (items.length === 0) return -1;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), items.length - 1);
}

/** The row that plays after `index`, or null at the end of the set. */
export function nextIndex(items: StageItem[], index: number): number | null {
  const current = resolveActiveIndex(items, index);
  if (current < 0) return null;
  return current + 1 < items.length ? current + 1 : null;
}

/** The row that played before `index`, or null at the top of the set. */
export function previousIndex(items: StageItem[], index: number): number | null {
  const current = resolveActiveIndex(items, index);
  if (current <= 0) return null;
  return current - 1;
}

/** Advances past trailing notes so "next" always lands on another song. */
export function nextSongIndex(items: StageItem[], index: number): number | null {
  const start = resolveActiveIndex(items, index);
  if (start < 0) return null;
  for (let i = start + 1; i < items.length; i++) {
    if (items[i].type === "song") return i;
  }
  return null;
}

/**
 * Estimated set length, from a per-song duration.
 *
 * Deliberately an estimate: the setlist stores no durations, and a clock that
 * claims false precision is worse than one that admits it is guessing.
 */
export const DEFAULT_SONG_MINUTES = 4;
const NOTE_BREAK_MINUTES = 1;

export function estimateTotalMinutes(items: StageItem[]): number {
  return items.reduce(
    (total, item) =>
      total + (item.type === "note" ? NOTE_BREAK_MINUTES : DEFAULT_SONG_MINUTES),
    0
  );
}

export interface StageTiming {
  /** Milliseconds since the stage clock started. */
  elapsedMs: number;
  /** Milliseconds of the estimated set left; never negative. */
  remainingMs: number;
  /** Estimated set length in milliseconds. */
  totalMs: number;
  /** 0-100, clamped. Drives the progress bar. */
  progressPct: number;
}

export function computeStageTiming(options: {
  startedAtMs: number;
  nowMs: number;
  items: StageItem[];
}): StageTiming {
  const totalMs = estimateTotalMinutes(options.items) * 60_000;
  // A clock started in the future would otherwise render a negative elapsed.
  const elapsedMs = Math.max(options.nowMs - options.startedAtMs, 0);
  const remainingMs = Math.max(totalMs - elapsedMs, 0);
  const progressPct =
    totalMs > 0 ? Math.min(Math.round((elapsedMs / totalMs) * 100), 100) : 0;

  return { elapsedMs, remainingMs, totalMs, progressPct };
}

export interface FormattedDuration {
  hours: number;
  minutes: number;
  seconds: number;
  /** "MM:SS", or "H:MM:SS" once there is an hour component. */
  text: string;
}

/**
 * Formats a duration as a stage clock.
 *
 * Minutes do not wrap at 60 in the long form, because a musician reading
 * "72:30" into a set is counting elapsed minutes, not reading a time of day.
 */
export function formatDuration(ms: number): FormattedDuration {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const text =
    hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;

  return { hours, minutes, seconds, text };
}

/** True once the estimated set is over, so the UI can flag an overrun. */
export function isOverrun(timing: StageTiming): boolean {
  return timing.totalMs > 0 && timing.elapsedMs > timing.totalMs;
}

export function previousSongIndex(
  items: StageItem[],
  index: number
): number | null {
  const start = resolveActiveIndex(items, index);
  if (start <= 0) return null;
  for (let i = start - 1; i >= 0; i--) {
    if (items[i].type === "song") return i;
  }
  return null;
}

/** 1-based "3 / 12" position, or an empty string when there is no active row. */
export function positionLabel(items: StageItem[], index: number): string {
  const active = resolveActiveIndex(items, index);
  if (active < 0) return "";
  return `${active + 1} / ${items.length}`;
}