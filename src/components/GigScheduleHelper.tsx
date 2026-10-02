"use client";

import { useState } from "react";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";
import { AI_BOX } from "@/lib/ai-ui";
import type { GigFormData } from "@/types";

type ScheduleStep = {
  key: "departure" | "arrival" | "soundcheck" | "dinner" | "stagePrep";
  label: string;
  time: string;
  detail: string;
};

type DaySchedule = {
  headline: string;
  steps: ScheduleStep[];
  assumptions: string[];
};

interface GigScheduleHelperProps {
  /** Null while the gig has not been saved yet (schedules are cached server-side). */
  gigId: string | null;
  form: GigFormData;
  isDutch: boolean;
}

/**
 * "Auto-generate schedule" helper.
 *
 * Sends the *unsaved* form state so the manager gets a schedule for the
 * logistics they just typed, not for whatever was last saved. The server
 * persists the result on the gig when it exists.
 */
export function GigScheduleHelper({
  gigId,
  form,
  isDutch,
}: GigScheduleHelperProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [cached, setCached] = useState(false);

  const copy = isDutch
    ? {
        generate: "Dagplanning genereren",
        working: "Bezig...",
        title: "AI dagplanning",
        basedOn: "Op basis van",
        assumptions: "Aannames",
        missing: "Vul minstens een venue of soundchecktijd in.",
      }
    : {
        generate: "Auto-generate schedule",
        working: "Working...",
        title: "AI day schedule",
        basedOn: "Based on",
        assumptions: "Assumptions",
        missing: "Add at least a venue or a soundcheck time first.",
      };

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch("/api/gigs/ai-schedule", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gigId: gigId ?? undefined,
          venueName: form.venueName,
          venueLocation: form.venueLocation,
          soundcheckTime: form.soundcheckTime,
          doorsOpenTime: form.doorsOpenTime,
          performanceDurationMinutes: form.performanceDurationMinutes,
          gearSetupNotes: form.gearSetupNotes,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed");

      setSchedule(body.schedule ?? null);
      setCached(Boolean(body.cached));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
      <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {copy.title}
      </legend>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        className="touch-target inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? (
          <Icons.Spinner className="h-4 w-4 animate-spin" />
        ) : (
          <Icons.Zap className="h-4 w-4" />
        )}
        {loading ? copy.working : copy.generate}
      </button>

      {error && (
        <p className={`${AI_BOX} mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300`}>
          {error}
        </p>
      )}

      {schedule && (
        <div className={`${AI_BOX} mt-3 space-y-3`}>
          {cached && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDutch
                ? "Eerder gegenereerd - opnieuw genereren met bijgewerkte gegevens?"
                : "Previously generated - regenerate with the updated details?"}
            </p>
          )}

          {schedule.headline && (
            <p className="break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-white">
              {schedule.headline}
            </p>
          )}

          <ol className="space-y-1.5">
            {schedule.steps.map((step) => (
              <li
                key={step.key}
                className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <span className="w-14 shrink-0 font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
                  {step.time}
                </span>
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <span className="block break-words text-sm font-medium text-slate-800 [overflow-wrap:anywhere] dark:text-slate-100">
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="mt-0.5 block break-words text-xs text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {schedule.assumptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {copy.assumptions}
              </p>
              <ul className="mt-1 space-y-0.5">
                {schedule.assumptions.map((assumption, i) => (
                  <li key={i} className="break-words text-xs text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">
                    - {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
