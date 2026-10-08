import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  callGroq,
  GroqError,
  isGroqConfigured,
  parseModelJson,
} from "@/lib/groq";
import { findBestMatch } from "@/lib/setlist-fuzzy";
import {
  assertPublicUrl,
  cleanScrapedText,
  isProbablyUrl,
  MAX_TEXT_CHARS,
  normaliseImportedSetlist,
} from "@/lib/ai-setlist-import";
import { extractTextLocally, isVisionModelUnavailable } from "@/lib/local-ocr";
import { getUserIdFromHeader, getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSongMetaFromNotes } from "@/lib/song-meta";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Matches at or above this score are linked to an existing song. */
const AUTO_MATCH_THRESHOLD = 0.8;
/** Below this the item is created as a plain custom entry. */
const SUGGEST_THRESHOLD = 0.5;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** v1.43.0: cap on a fetched page so a huge document cannot exhaust memory. */
const MAX_URL_BYTES = 3 * 1024 * 1024;
const URL_FETCH_TIMEOUT_MS = 10_000;
/**
 * Fetches a pasted setlist URL and returns it as plain text.
 *
 * Every guard lives here, next to the fetch, because the point of the guard is
 * the fetch: a user-supplied URL turns this endpoint into a proxy, so without
 * `assertPublicUrl` anyone could ask the server to read cloud instance metadata
 * or probe the private network the app runs in.
 *
 * Redirects are followed manually and re-validated, since a public URL that
 * 302s to `http://169.254.169.254/` would otherwise walk straight past the check.
 */
async function fetchUrlAsText(input: string): Promise<string> {
  let target = assertPublicUrl(input);

  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(target.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
      headers: {
        // Some sites serve a stripped page to unknown agents.
        "User-Agent": "Mozilla/5.0 (compatible; GigsManager/1.0; +setlist-import)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("That link did not redirect anywhere useful.");
      // Re-validate: a redirect is a new destination and needs its own check.
      target = assertPublicUrl(new URL(location, target).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`That page could not be read (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      throw new Error("That link is not a web page we can read.");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_URL_BYTES) {
      throw new Error("That page is too large to import.");
    }
    return cleanScrapedText(new TextDecoder("utf-8").decode(buffer));
  }

  throw new Error("That link redirected too many times.");
}

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
{
  "title": "the setlist or show title, or null when there is none",
  "items": [
    {
      "kind": "song" | "special",
      "title": "string",
      "key": "string or null",
      "bpm": "number or null",
      "tuning": "string or null",
      "duration": "string or null",
      "notes": "string or null",
      "raw": "the original line"
    }
  ]
}

Rules:
- "kind": "song" for actual songs, "special" for non-song blocks such as
  BINDTEKST, PAUZE, "tweede set", encore, DJ-set or any other stage cue.
- For a "special" item, put the cue text in "title" (for example "BINDTEKST",
  "PAUZE", "Tweede set").
- For a song, "title" is ONLY the song title: strip the leading number
  ("1.", "12)"), strip trailing annotations like "(Zinnia)" or "(Julot)",
  strip "key/tempo" fragments after a dash, and drop any artist name.
- Put what you stripped into the structured fields instead of discarding it:
  a trailing "in Am" becomes "key": "Am", "112 bpm" becomes "bpm": 112,
  "drop D" becomes "tuning": "drop D". Use null when the source does not say.
- Never invent a key or tempo that is not in the source. A null is correct; an
  invented key silently writes the wrong thing on the music stand.
- "notes" holds arrangement cues like "half time", "acoustic intro" or a name
  in brackets. "duration" is whatever the source states, as written ("3:45").
- "title" at the top level is the show or setlist title when the source names
  one (often the artist or the festival). Use null otherwise.
- "raw" keeps the untouched original line so the user can verify the match.
- Preserve the original order exactly. Never merge or reorder songs.`;

/**
 * Resolves the internal user id from the Supabase JWT. */
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
    // v1.43.0: a pasted setlist.fm / any public page. Distinguished from raw
    // text by an explicit scheme, so "1. Enter Sandman" is never fetched.
    const pastedUrl: string =
      typeof body?.url === "string" ? body.url.trim() : "";

    if (!text.trim() && !imageDataUrl && !pastedUrl) {
      return NextResponse.json(
        { error: "Provide setlist text, a link, or an image to read." },
        { status: 400 }
      );
    }

    if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "imageDataUrl must be an image data URL." },
        { status: 400 }
      );
    }

    // --- Step 0: resolve a pasted URL into text -----------------------------
    let rawText = text.trim();
    let ocrUsed = false;
    let ocrFallback: "local" | null = null;
    let fetchedUrl: string | null = null;

    if (pastedUrl) {
      if (!isProbablyUrl(pastedUrl)) {
        return NextResponse.json(
          { error: "That does not look like a link. Start it with https://" },
          { status: 400 }
        );
      }
      try {
        rawText = await fetchUrlAsText(pastedUrl);
        fetchedUrl = pastedUrl;
      } catch (err) {
        // A failed fetch is the user's problem to fix, not a server fault.
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "That link could not be read." },
          { status: 400 }
        );
      }
    }

    if (rawText.length > MAX_TEXT_CHARS) {
      rawText = rawText.slice(0, MAX_TEXT_CHARS);
    }

    if (imageDataUrl) {
      if (imageDataUrl.length > MAX_IMAGE_BYTES * 1.4) {
        return NextResponse.json(
          { error: "Image is larger than 6 MB." },
          { status: 413 }
        );
      }

      // --- Step 1: read the image --------------------------------------------
      // v1.45.0: vision first, local Tesseract if no vision model is reachable.
      // Either way this produces raw text; Step 2 structures it with the text
      // model, which is a far more available dependency than vision.
      try {
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
          { family: "vision", temperature: 0, maxTokens: 2000 }
        );

        const ocrParsed = parseModelJson<{ text?: string }>(ocrRaw);
        rawText = (ocrParsed?.text ?? "").trim();
        ocrUsed = true;
      } catch (ocrError) {
        if (!isVisionModelUnavailable(ocrError)) throw ocrError;

        console.warn(
          "[setlist-import] No vision model available — reading the photo locally."
        );
        const base64 = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);
        const local = await extractTextLocally(Buffer.from(base64, "base64"));
        if (local.outcome !== "ok" || !local.text) {
          return NextResponse.json(
            {
              error:
                "This photo could not be read, and the AI vision service is unavailable for this account. Paste the setlist text instead.",
            },
            { status: 422 }
          );
        }
        rawText = local.text.trim().slice(0, MAX_TEXT_CHARS);
        ocrUsed = true;
        ocrFallback = "local";
      }

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
          content: `${rawText.slice(
            0,
            8000
          )}\n\nConvert this setlist to JSON items.`,
        },
      ],
      { family: "text", json: true, temperature: 0, maxTokens: 2500 }
    );

    // v1.43.0: normalise once, here, so key/bpm/tuning/duration/notes are a
    // known shape downstream instead of whatever the model happened to emit.
    const structured = normaliseImportedSetlist(
      parseModelJson<unknown>(parsedRaw)
    );
    const rawItems = structured.songs;

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "No setlist items could be recognised in that text." },
        { status: 422 }
      );
    }

    // --- Step 3: fuzzy match against the user's song library ----------------
    const library = await prisma.songs.findMany({
      where: { userId },
      select: { id: true, title: true, notes: true },
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
        const title = raw.title;
        const rawLine = (raw.raw ?? title).trim();
        const kind = raw.kind === "special" ? "special" : "song";
        // v1.43.0: the structured fields ride along so the review stage can show
        // (and let the user fix) key/bpm/tuning before saving.
        const details = {
          key: raw.key,
          bpm: raw.bpm,
          tuning: raw.tuning,
          duration: raw.duration,
          notes: raw.notes,
        };

        if (!title) return null;

        if (kind === "special") {
          return { index, kind: "special" as const, title, raw: rawLine, details, match: null };
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
            // v1.49.1: inherit metadata from the existing library record when
            // the import did not supply it, so the review stage starts from
            // the library's own key/bpm/tuning/notes instead of blanks.
            const parsed = parseSongMetaFromNotes(best.item.notes);
            if (parsed) {
              if (!details.key && parsed.keySignature) details.key = parsed.keySignature;
              if (!details.bpm && parsed.bpm) {
                const bpm = Number(parsed.bpm);
                if (Number.isFinite(bpm)) details.bpm = bpm;
              }
              if (!details.tuning && parsed.keySignature) details.tuning = parsed.keySignature;
              if (!details.notes && parsed.comments) details.notes = parsed.comments;
            }
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

        return { index, kind: "song" as const, title, raw: rawLine, details, match };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      items,
      rawText,
      ocrUsed,
      // v1.43.0: which input produced this, so the UI can label the review stage.
      source: fetchedUrl ? "url" : imageDataUrl ? "image" : "text",
      // v1.45.0: non-null means vision was unreachable and Tesseract was used,
      // which is worth surfacing: the transcript is rougher and the user should
      // know to check the review stage carefully.
      ocrFallback,
      title: structured.title,
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
