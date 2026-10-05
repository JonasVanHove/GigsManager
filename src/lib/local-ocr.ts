/**
 * Local (in-process) OCR fallback (v1.45.0).
 *
 * When Groq's vision models cannot serve a request, the setlist photo still has
 * to be readable. Tesseract runs on the server, needs no API key and no
 * network round trip to a model provider, so it is the right fallback: the
 * expensive, *structured* extraction still goes through Groq afterwards — this
 * only produces the raw text.
 *
 * Two things make this safe to depend on:
 *
 *  - The Tesseract import is dynamic, so the WASM core and the language data
 *    are never loaded on a request that did not need them. Importing it eagerly
 *    would pull megabytes into every API route that transitively imports this
 *    file.
 *  - The worker is created at most once per process and reused. Tesseract takes
 *    seconds to initialise, and paying that per photo would be unusable.
 *
 * Everything here fails soft: a missing traineddata, an unwritable cache or a
 * serverless cold start with no /tmp all return null rather than throwing, and
 * the caller reports "no text" exactly as it would have without this module.
 */

/** How a local OCR attempt ended, for logging and for the caller's message. */
export type LocalOcrOutcome = "ok" | "empty" | "unavailable" | "failed";

export interface LocalOcrResult {
  outcome: LocalOcrOutcome;
  text: string | null;
}

/**
 * Runs OCR over an image buffer.
 *
 * Injectable so the fallback logic can be tested without starting Tesseract,
 * which would otherwise download ~10MB of language data during the test run.
 */
export type LocalOcrRunner = (buffer: Buffer) => Promise<string | null>;

let workerPromise: Promise<any> | null = null;

/** Test seam: drops the cached worker so a test can start from scratch. */
export function resetLocalOcrWorker(): void {
  workerPromise = null;
}

/**
 * Creates (or reuses) the Tesseract worker.
 *
 * `cacheMethod: "none"` is deliberate. Tesseract defaults to caching the
 * downloaded language data on disk, which fails on read-only serverless
 * filesystems; failing to cache is harmless because the worker is reused for
 * the life of the process.
 */
async function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        cacheMethod: "none",
        // Tesseract logs progress to console by default; that noise does not
        // belong in a request log.
        logger: () => {},
        errorHandler: () => {},
      });
    })().catch((error) => {
      // A failed import must not poison the promise for the next request.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** The real Tesseract runner. Exported so callers can bypass the fallback chain. */
export const runTesseract: LocalOcrRunner = async (buffer) => {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  return text.length > 0 ? text : null;
};

/**
 * Reads an image locally, never throwing.
 *
 * A null result means "could not read it here", which is indistinguishable
 * from a blank image as far as callers are concerned — both mean there is no
 * text to work with.
 */
export async function extractTextLocally(
  buffer: Buffer,
  runner: LocalOcrRunner = runTesseract
): Promise<LocalOcrResult> {
  if (!buffer || buffer.byteLength === 0) {
    return { outcome: "empty", text: null };
  }

  let text: string | null = null;
  try {
    text = await runner(buffer);
  } catch (error) {
    console.warn("[local-ocr] Tesseract failed:", error);
    return { outcome: "unavailable", text: null };
  }

  return text ? { outcome: "ok", text } : { outcome: "empty", text: null };
}

/**
 * True when the failure means "this vision model cannot serve this key".
 *
 * The 403/404 and "not enabled / not found" wording is exactly what the Groq
 * client already classifies as a model-availability problem, so this defers to
 * that rather than keeping a second, drifting copy of the rule.
 *
 * The narrowness matters: a bad API key, a rate limit or a transport failure
 * are not fixed by reading the image locally, so those deliberately do not
 * trigger the fallback — trying would only double the latency of a call that
 * was already going to fail.
 */
export function isVisionModelUnavailable(error: unknown): boolean {
  if (!error) return false;

  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && status !== 403 && status !== 404) return false;

  const message = error instanceof Error ? error.message : String(error);
  // The wording Groq actually produces for an unusable model id, across the
  // shapes the client normalises them into: "model_not_found", "not enabled
  // for your organization", "no longer available", and the chain-exhausted
  // "looks retired or unavailable to this key".
  return /not (?:found|available|enabled|exist)|decommissioned|retired|cannot use|no longer available|unavailable|model_not_found|has no access/i.test(
    message
  );
}