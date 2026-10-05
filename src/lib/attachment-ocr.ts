import { callGroq } from "@/lib/groq";
import {
  extractTextLocally,
  isVisionModelUnavailable,
  type LocalOcrRunner,
} from "@/lib/local-ocr";

/**
 * Image OCR for gig attachments.
 *
 * Contracts, riders and run sheets arrive as photos taken on a phone. The
 * vision model reads them once, here, and the extracted text is cached on the
 * attachment row so every later "State of Play" summary is a cheap text request
 * instead of another vision round-trip.
 *
 * v1.45.0: when no vision model is reachable for the key, the image is read
 * locally with Tesseract instead. It produces rougher text than the model, but
 * a rough transcript the text model can still structure beats no import at all.
 */

/** Image types we will send to the vision model. */
const OCR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Enough for a contract page; guards against a 40-photo dump. */
export const MAX_OCR_CHARS = 12_000;

/** Base64 payloads are sent inline, so keep a hard ceiling on the encoded size. */
const MAX_INLINE_BYTES = 5 * 1024 * 1024;

export function isOcrEligible(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase().trim();
  return OCR_MIME_TYPES.has(normalized) || normalized === "image/jpg";
}

const OCR_SYSTEM_PROMPT = `You transcribe images. You are reading booking documents: contracts, riders, run sheets, schedules, invoices or handwritten notes.

Rules:
- Output ONLY the readable text, in reading order. No commentary, no markdown headings, no summary.
- Preserve the structure loosely with blank lines between sections (e.g. a fee block, a schedule block).
- If a line is genuinely illegible, write [illegible] rather than guessing.
- Never invent numbers, dates or names. Transcribe what is there.
- If the image contains no readable text at all, reply with exactly: NO_TEXT_FOUND`;

/**
 * Runs OCR over an image buffer.
 *
 * Returns the transcribed text, or null when the image had nothing readable or
 * no OCR path could serve it. Callers treat null as "no cached text" and fall
 * back to whatever they were doing before, so neither a Groq outage nor a
 * missing local OCR engine may fail an upload.
 *
 * `localRunner` is injectable for tests; production always uses Tesseract.
 */
export async function extractImageText(
  buffer: Buffer,
  mimeType: string,
  localRunner?: LocalOcrRunner
): Promise<string | null> {
  if (buffer.byteLength > MAX_INLINE_BYTES) {
    console.warn(
      `[ocr] Skipping ${buffer.byteLength}-byte image: over the inline limit`
    );
    return null;
  }

  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  try {
    const raw = await callGroq(
      [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: "Transcribe all readable text in this document image.",
            },
            { type: "image_url" as const, image_url: { url: dataUrl } },
          ],
        },
      ],
      { family: "vision", temperature: 0, maxTokens: 2000 }
    );

    const text = raw.trim();
    // A clean NO_TEXT_FOUND means the model read the image and it was blank.
    // That is a successful read, so there is nothing for the local fallback to
    // improve on.
    if (!text || text === "NO_TEXT_FOUND") return null;
    return text.slice(0, MAX_OCR_CHARS);
  } catch (error) {
    // Non-fatal by design: the upload itself already succeeded.
    console.warn("[ocr] Vision extraction failed:", error);

    if (!isVisionModelUnavailable(error)) return null;

    console.warn("[ocr] No vision model available — falling back to local OCR.");
    const local = await extractTextLocally(buffer, localRunner);
    if (local.outcome === "ok" && local.text) {
      return local.text.slice(0, MAX_OCR_CHARS);
    }
    return null;
  }
}

/**
 * Resolves an attachment URL to something the vision model can read.
 *
 * Attachments live in Supabase Storage and are stored as remote public URLs,
 * but Groq's vision endpoint only accepts inline `data:` payloads. Without this
 * step every Storage-backed image was silently dropped from the summary — the
 * code looked for `data:image/` and found none.
 */
export async function toInlineImage(
  url: string,
  maxBytes: number = MAX_INLINE_BYTES
): Promise<string | null> {
  if (url.startsWith("data:image/")) return url;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      console.warn(
        `[ocr] Skipping remote image: ${buffer.byteLength} bytes exceeds ${maxBytes}`
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) return null;

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn("[ocr] Could not fetch remote image:", error);
    return null;
  }
}