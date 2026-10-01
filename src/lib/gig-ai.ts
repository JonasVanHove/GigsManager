/**
 * Shared contracts for the Groq logistics/messaging routes.
 *
 * These live here rather than in the route files because Next.js only allows a
 * route module to export HTTP handlers and framework config.
 */

export const MESSAGE_KINDS = [
  "rider",
  "arrival",
  "thankyou",
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type DraftedMessage = {
  subject: string;
  body: string;
  channel: "email" | "whatsapp";
};

export const SCHEDULE_STEP_KEYS = [
  "departure",
  "arrival",
  "soundcheck",
  "dinner",
  "stagePrep",
] as const;

export type ScheduleStepKey = (typeof SCHEDULE_STEP_KEYS)[number];

export type ScheduleStep = {
  key: ScheduleStepKey;
  label: string;
  /** "HH:MM" in the venue's local time. */
  time: string;
  detail: string;
};

export type DaySchedule = {
  headline: string;
  steps: ScheduleStep[];
  assumptions: string[];
};

/** "HH:MM", 24-hour, zero-padded. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time.trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Rejects the classic scheduling mistakes a model occasionally produces:
 * malformed times, or steps that run backwards (departure after arrival, dinner
 * after the band was supposed to be on stage).
 */
export function isChronologicallyValid(times: string[]): boolean {
  const parsed = times.map(timeToMinutes);
  if (parsed.some((value) => Number.isNaN(value))) return false;
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i] < parsed[i - 1]) return false;
  }
  return true;
}