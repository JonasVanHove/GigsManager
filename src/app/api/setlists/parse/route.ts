import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  callGroq,
  GROQ_MODELS,
  GroqError,
  isGroqConfigured,
  parseModelJson,
} from "@/lib/groq";
import { findBestMatch } from "@/lib/setlist-fuzzy";
import { getUserIdFromHeader, getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Matches at or above this score are linked to an existing song. */
const AUTO_MATCH_THRESHOLD = 0.8;
/** Below this the item is created as a plain custom entry. */
const SUGGEST_THRESHOLD = 0.5;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const OCR_SYSTEM_PROMPT = `You transcribe images of handwritten or printed setlists.
Return ONLY a JSON object: { "text": "the full transcription, line breaks preserved" }.

Rules:
- Transcribe EXACTLY what is on the image: song titles, numbering, intermission
  notes, "BINDTEKST" cues, scribbled annotations such as "(Zinnia)" or "(Julot)".
- Do not translate, correct, expand abbreviations or reorder anything.
- Keep the original numbering and line order.
- If part of the image is unreadable, write [onleesbaar] for that part.`;

const PARSE_SYSTEM_PROMPT = `You convert a raw, unstructured setlist into an ordered list of items.

Return ONLY a JSON object:
{ "items": [ { "kind": "song" | "special", "title": "string", "raw": "the original line" } ] }

Rules:
- "kind": "song" for actual songs, "special" for non-song blocks such as
  BINDTEKST, PAUZE, "tweede set", encore, DJ-set or any other stage cue.
- For a "special" item, put the cue text in "title" (for example "BINDTEKST",
  "PAUZE", "Tweede set").
- For a "song", "title" is ONLY the song title: strip the leading number
  ("1.", "12)"), strip trailing annotations like "(Zinnia)" or "(Julot)",
  strip "key/tempo" fragments after a dash, and drop any artist name.
- "raw" keeps the untouched original line so the user can verify the match.
- Preserve the original order exactly. Never merge or reorder songs.`;

type RawItem = { kind?: string; title?: string; raw?: string };

/** Resolves the internal user id from the Supabase JWT. */
async function resolveUserId(request: NextRequest): Promise<string | null> {
  const fallback = getUserIdFromHeader(request);
  if (!fallback) return null;

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return fallback;

  try {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (!data.user) return fallback;
    const user = await getOrCreateUser(
      data.user.id,
      data.user.email || "",
      data.user.user_metadata?.name
    );
    return user.id;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGroqConfigured()) {
    return NextResponse.json(
      {
        error:
          "Setlist import is not configured on this server (missing GROQ_API_KEY).",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const text: string = typeof body?.text === "string" ? body.text : "";
    const imageDataUrl: string | null =
      typeof body?.imageDataUrl === "string" ? body.imageDataUrl : null;

    if (!text.trim() && !imageDataUrl) {
      return NextResponse.json(
        { error: "Provide setlist text or an image to read." },
        { status: 400 }
      );
    }

    if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "imageDataUrl must be an image data URL." },
        { status: 400 }
      );
    }

    // --- Step 1: OCR when an image was supplied ----------------------------
    let rawText = text.trim();
    let ocrUsed = false;

    if (imageDataUrl) {
      if (imageDataUrl.length > MAX_IMAGE_BYTES * 1.4) {
        return NextResponse.json(
          { error: "Image is larger than 6 MB." },
          { status: 413 }
        );
      }

      const ocrRaw = await callGroq(
        [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this setlist image." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        { model: GROQ_MODELS.vision, temperature: 0, maxTokens: 2000 }
      );

      const ocrParsed = parseModelJson<{ text?: string }>(ocrRaw);
      rawText = (ocrParsed?.text ?? "").trim();
      ocrUsed = true;

      if (!rawText) {
        return NextResponse.json(
          {
            error:
              "No text could be read from that image. Try a sharper, straight-on photo.",
          },
          { status: 422 }
        );
      }
    }

    // --- Step 2: structure the text ----------------------------------------
    const parsedRaw = await callGroq(
      [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${rawText.slice(0, 8000)}\n\nConvert this setlist to JSON items.`,
        },
      ],
      { model: GROQ_MODELS.text, json: true, temperature: 0, maxTokens: 2500 }
    );

    const parsed = parseModelJson<{ items?: RawItem[] }>(parsedRaw);
    const rawItems = parsed && Array.isArray(parsed.items) ? parsed.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "No setlist items could be recognised in that text." },
        { status: 422 }
      );
    }

    // --- Step 3: fuzzy match against the user's song library ----------------
    const library = await prisma.songs.findMany({
      where: { userId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
      take: 2000,
    });

    const candidates = library.map((song) => ({
      title: song.title,
      item: song,
    }));
    const usedSongIds = new Set<string>();

    const items = rawItems
      .map((raw, index) => {
        const title = (raw.title ?? "").trim();
        const rawLine = (raw.raw ?? title).trim();
        const kind = raw.kind === "special" ? "special" : "song";

        if (!title) return null;

        if (kind === "special") {
          return { index, kind: "special" as const, title, raw: rawLine, match: null };
        }

        const best = findBestMatch(title, candidates, 0);
        let match: {
          songId: string;
          title: string;
          score: number;
          confidence: "high" | "low";
        } | null = null;

        if (best && !usedSongIds.has(best.item.id)) {
          if (best.score >= AUTO_MATCH_THRESHOLD) {
            match = {
              songId: best.item.id,
              title: best.item.title,
              score: best.score,
              confidence: "high",
            };
            usedSongIds.add(best.item.id);
          } else if (best.score >= SUGGEST_THRESHOLD) {
            // Below the auto-match threshold we surface a suggestion but do NOT
            // link it: an unverified DB link would silently attach wrong data.
            match = {
              songId: best.item.id,
              title: best.item.title,
              score: best.score,
              confidence: "low",
            };
          }
        }

        return { index, kind: "song" as const, title, raw: rawLine, match };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      items,
      rawText,
      ocrUsed,
      librarySize: library.length,
      thresholds: { autoMatch: AUTO_MATCH_THRESHOLD, suggest: SUGGEST_THRESHOLD },
    });
  } catch (err) {
    if (err instanceof GroqError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/setlists/parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse the setlist" },
      { status: 500 }
    );
  }
}
