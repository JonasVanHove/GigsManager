import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { callGroq, GroqError, isGroqConfigured, parseModelJson } from "@/lib/groq";
import { requireAuth } from "@/lib/auth-helpers";
import type { FlowAnalysis } from "@/lib/setlist-flow";

export const runtime = "nodejs";
export const maxDuration = 60;



const SYSTEM_PROMPT = `You are an experienced live-music set designer (music supervisor / tour manager)
who programmes sets for working bands.

You are given a setlist in playing order, with each item's key signature and BPM when known.
Assess the FLOW and ENERGY of the running order and return actionable, concrete feedback.

Rules:
- Judge pacing and the emotional arc: does the set build, does it sag, does the finale land?
- Flag awkward key transitions, ESPECIALLY when consecutive songs sit far apart on the
  circle of fifths with no pause marker (BINDTEKST / PAUZE / BIS) between them to cover
  the retune. A nearby transition is "info", a large jump without a gap is "warning".
- Suggest at most 3 concrete reorderings, each expressed as moves that turn the CURRENT
  order into the improved one. Never reference items by their number: always use "id".
- Be specific and short. No generic praise, no invented facts about the band.
- If a field is "Onbekend"/unknown, do not treat it as a real key; say so in the analysis.`;

const SHAPE = `Return ONLY a JSON object with this exact shape:
{
  "overallScore": 0-100,
  "headline": "one sentence verdict on the energy arc",
  "energyArc": ["what happens in the first third", "...", "..."],
  "pacing": ["short, concrete pacing observations"],
  "keyWarnings": [
    { "fromIndex": 0, "toIndex": 1, "fromTitle": "", "toTitle": "",
      "severity": "info" | "warning", "message": "why this transition is awkward" }
  ],
  "suggestions": [
    { "description": "what this reordering achieves",
      "move": [ { "itemId": "the id given in the input", "toIndex": 2 } ] }
  ]
}`;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isGroqConfigured()) {
    return NextResponse.json(
      { error: "AI setlist analysis is not configured (missing GROQ_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const setlist = await prisma.setlist.findFirst({
      where: { id: params.id, userId: authResult.user.id },
      include: {
        items: { orderBy: { order: "asc" } },
        band: { select: { name: true } },
      },
    });

    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }

    // Special blocks (BINDTEKST / PAUZE / BIS) are pacing markers, not songs:
    // they must stay visible to the model, otherwise it cannot tell whether a
    // key change had time to be covered on stage.
    const lines = setlist.items.map((item, index) => {
      const isSpecial = item.type === "special";
      const title = (item.title || "Untitled").replace(/\s+/g, " ").trim();
      return `${index + 1}. [${isSpecial ? "MARKER" : "SONG"}] id=${item.id} key=${item.keySignature || "Onbekend"} bpm=${item.bpm ?? "Onbekend"} tuning=${item.tuning || "Onbekend"} | ${title}`;
    });

    if (lines.length === 0) {
      return NextResponse.json(
        { error: "This setlist has no items to analyse yet." },
        { status: 422 }
      );
    }

    const context = [
      `Setlist: ${setlist.title}`,
      setlist.band?.name ? `Band: ${setlist.band.name}` : null,
      setlist.locatie ? `Venue: ${setlist.locatie}` : null,
      setlist.datum ? `Date: ${setlist.datum}` : null,
      `Items (${lines.length}):`,
      ...lines,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callGroq(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${context}\n\n${SHAPE}` },
      ],
      { json: true, temperature: 0.3, maxTokens: 2000 }
    );

    const parsed = parseModelJson<FlowAnalysis>(raw);
    if (!parsed || typeof parsed.overallScore !== "number") {
      return NextResponse.json(
        { error: "The AI returned an unexpected response. Please try again." },
        { status: 502 }
      );
    }

    const validIds = new Set(setlist.items.map((item) => item.id));
    const clampScore = Math.max(0, Math.min(100, Math.round(parsed.overallScore)));
    const strings = (value: unknown, max: number) =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string").slice(0, max)
        : [];

    const analysis: FlowAnalysis = {
      overallScore: clampScore,
      headline: typeof parsed.headline === "string" ? parsed.headline : "",
      energyArc: strings(parsed.energyArc, 6),
      pacing: strings(parsed.pacing, 8),
      // Drop warnings whose indexes point outside the setlist: a hallucinated
      // index would highlight the wrong row in the UI.
      keyWarnings: (Array.isArray(parsed.keyWarnings) ? parsed.keyWarnings : [])
        .filter(
          (w) =>
            w &&
            typeof w.fromTitle === "string" &&
            Number.isInteger(w.fromIndex) &&
            Number.isInteger(w.toIndex) &&
            w.fromIndex >= 0 &&
            w.toIndex < setlist.items.length &&
            (w.severity === "info" || w.severity === "warning")
        )
        .slice(0, 10)
        .map((w) => ({
          fromIndex: w.fromIndex,
          toIndex: w.toIndex,
          fromTitle: w.fromTitle,
          toTitle: typeof w.toTitle === "string" ? w.toTitle : "",
          severity: w.severity,
          message: typeof w.message === "string" ? w.message : "",
        })),
      suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
        .filter((s) => s && typeof s.description === "string" && Array.isArray(s.move))
        .slice(0, 3)
        .map((s) => ({
          description: s.description,
          // Only keep moves that reference a real item in this setlist.
          move: s.move
            .filter(
              (m) => m && typeof m.itemId === "string" && validIds.has(m.itemId)
            )
            .slice(0, 30)
            .map((m) => ({ itemId: m.itemId, toIndex: m.toIndex })),
        }))
        .filter((s) => s.move.length > 0),
    };

    return NextResponse.json({ analysis });
  } catch (err) {
    if (err instanceof GroqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/setlists/[id]/ai-analyze error:", err);
    return NextResponse.json(
      { error: "Failed to analyse the setlist" },
      { status: 500 }
    );
  }
}
