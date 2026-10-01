import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callGroq, GroqError, isGroqConfigured, parseModelJson } from "@/lib/groq";
import { requireAuth } from "@/lib/auth-helpers";
import {
  SCHEDULE_STEP_KEYS,
  TIME_PATTERN,
  isChronologicallyValid,
  type DaySchedule,
  type ScheduleStep,
  type ScheduleStepKey,
} from "@/lib/gig-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You plan the day of a live music gig for a working band.

You are given the venue, the soundcheck slot, when the doors open, how long the
performance lasts, the gear and the band size. Produce a realistic running order
for the day with concrete clock times.

Rules:
- Work BACKWARDS from soundcheck: load-in, arrival, departure and the meal break
  must all physically fit before the band is on stage, ready and rested.
- Respect the venue's local clock. If soundcheck is at 16:00, the band is on
  stage at 16:00, not at 15:00.
- Never schedule departure AFTER arrival, and never a step before it depends on.
- A bigger rig and more musicians need more load-in and a longer dinner.
- Use 24-hour "HH:MM" times. If the input is missing, say so in "assumptions"
  and still propose a sensible working plan.
- "detail" is one short sentence the band can act on.`;

const SHAPE = `Return ONLY a JSON object with this exact shape:
{
  "headline": "one sentence describing the shape of the day",
  "assumptions": ["what you had to assume"],
  "steps": [
    { "key": "departure",  "label": "Departure / leave home", "time": "HH:MM", "detail": "..." },
    { "key": "arrival",    "label": "Arrival & load-in",      "time": "HH:MM", "detail": "..." },
    { "key": "soundcheck", "label": "Soundcheck",              "time": "HH:MM", "detail": "..." },
    { "key": "dinner",     "label": "Dinner / rest",           "time": "HH:MM", "detail": "..." },
    { "key": "stagePrep",  "label": "Stage prep",              "time": "HH:MM", "detail": "..." }
  ]
}`;



export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isGroqConfigured()) {
    return NextResponse.json(
      { error: "AI schedules are not configured (missing GROQ_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const gigId = typeof body?.gigId === "string" ? body.gigId : null;

    // The schedule generator works both for a saved gig and for a gig that is
    // still being filled in, so the logistics fields can come from either the
    // database or the (unsaved) form state.
    let gig = null;
    if (gigId) {
      gig = await prisma.gig.findFirst({
        where: { id: gigId, userId: authResult.user.id },
        select: {
          id: true,
          eventName: true,
          date: true,
          performers: true,
          numberOfMusicians: true,
          notes: true,
          venueName: true,
          venueLocation: true,
          soundcheckTime: true,
          doorsOpenTime: true,
          performanceDurationMinutes: true,
          gearSetupNotes: true,
          performanceLineup: true,
          setlistId: true,
        },
      });
      if (!gig) {
        return NextResponse.json({ error: "Gig not found" }, { status: 404 });
      }
    }

    const pick = <T,>(dbValue: T | null | undefined, formValue: unknown): T | null => {
      if (typeof formValue === "string" && formValue.trim()) {
        return formValue.trim() as unknown as T;
      }
      if (typeof formValue === "number" && Number.isFinite(formValue)) {
        return formValue as unknown as T;
      }
      return dbValue ?? null;
    };

    const venueName = pick(gig?.venueName ?? null, body?.venueName);
    const venueLocation = pick(gig?.venueLocation ?? null, body?.venueLocation);
    const soundcheckTime = pick(gig?.soundcheckTime ?? null, body?.soundcheckTime);
    const doorsOpenTime = pick(gig?.doorsOpenTime ?? null, body?.doorsOpenTime);
    const gearSetupNotes = pick(gig?.gearSetupNotes ?? null, body?.gearSetupNotes);
    const durationRaw = body?.performanceDurationMinutes;
    const performanceDurationMinutes =
      pick(gig?.performanceDurationMinutes ?? null, durationRaw) ?? 90;
    const musicians = gig?.numberOfMusicians ?? 4;

    if (!venueName && !venueLocation && !soundcheckTime) {
      return NextResponse.json(
        {
          error:
            "Add at least a venue or a soundcheck time before generating a schedule.",
        },
        { status: 400 }
      );
    }

    const context = [
      gig ? `Event: ${gig.eventName}` : "Event: (new gig)",
      gig ? `Date: ${new Date(gig.date).toISOString().slice(0, 10)}` : null,
      gig ? `Booker: ${gig.performers}` : null,
      `Venue: ${venueName || "unknown"}`,
      `Venue address: ${venueLocation || "unknown"}`,
      `Soundcheck: ${soundcheckTime || "unknown"}`,
      `Doors open: ${doorsOpenTime || "unknown"}`,
      `Set length: ${performanceDurationMinutes} minutes`,
      `Musicians travelling with the band: ${musicians}`,
      `Gear / rig: ${gearSetupNotes || "not specified"}`,
      gig?.performanceLineup ? `Line-up: ${gig.performanceLineup}` : null,
      gig?.notes ? `Internal notes: ${gig.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callGroq(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${context}\n\n${SHAPE}` },
      ],
      { json: true, temperature: 0.3, maxTokens: 1200 }
    );

    const parsed = parseModelJson<DaySchedule>(raw);
    const steps: ScheduleStep[] = (Array.isArray(parsed?.steps) ? parsed!.steps : [])
      .filter(
        (step): step is ScheduleStep =>
          Boolean(step) &&
          SCHEDULE_STEP_KEYS.includes(step.key as ScheduleStepKey) &&
          typeof step.time === "string" &&
          TIME_PATTERN.test(step.time.trim())
      )
      .slice(0, SCHEDULE_STEP_KEYS.length)
      .map((step) => ({
        key: step.key as ScheduleStepKey,
        label: typeof step.label === "string" ? step.label : step.key,
        time: step.time.trim(),
        detail: typeof step.detail === "string" ? step.detail : "",
      }));

    if (steps.length === 0 || !isChronologicallyValid(steps.map((step) => step.time))) {
      return NextResponse.json(
        {
          error:
            "The AI returned an inconsistent schedule (steps out of order). Please try again.",
        },
        { status: 502 }
      );
    }

    const schedule: DaySchedule = {
      headline: typeof parsed!.headline === "string" ? parsed!.headline : "",
      assumptions: Array.isArray(parsed!.assumptions)
        ? parsed!.assumptions
            .filter((a): a is string => typeof a === "string")
            .slice(0, 8)
        : [],
      // Return in the canonical order regardless of the order the model used.
      steps: SCHEDULE_STEP_KEYS.map(
        (key) => steps.find((step) => step.key === key)
      ).filter((step): step is ScheduleStep => Boolean(step)),
    };

    // Cache on the gig when it exists; `force` regenerates.
    const force = Boolean(body?.force);
    if (gig && !force && gigId) {
      const existing = await prisma.gig.findUnique({
        where: { id: gig.id },
        select: { aiSchedule: true },
      });
      if (existing?.aiSchedule) {
        return NextResponse.json({
          schedule: JSON.parse(existing.aiSchedule),
          cached: true,
        });
      }
    }

    const generatedAt = new Date();
    if (gigId) {
      await prisma.gig.update({
        where: { id: gigId },
        data: { aiSchedule: JSON.stringify(schedule), aiScheduleAt: generatedAt },
      });
    }

    return NextResponse.json({ schedule, cached: false, generatedAt });
  } catch (err) {
    if (err instanceof GroqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/gigs/ai-schedule error:", err);
    return NextResponse.json(
      { error: "Failed to generate the schedule" },
      { status: 500 }
    );
  }
}
