import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The local-OCR warning banner in the setlist photo import review stage.
 *
 * Two layers, matching how the rest of this suite tests UI:
 *  1. Behaviour of the exported `usesLocalOcrFallback` predicate - this is what
 *     decides whether the banner renders, so it gets real assertions. It lives
 *     in `src/lib` because vitest cannot transform `.tsx` here ("jsx":
 *     "preserve" in tsconfig.json for Next.js).
 *  2. Source wiring - that the parse response feeds it, that the banner is
 *     actually guarded by it, and that a stale warning cannot survive a new
 *     analysis (which would tell the user to double-check titles that came
 *     from Vision AI just fine).
 */
import { usesLocalOcrFallback } from "@/lib/ai-setlist-import";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "SetlistImportModal.tsx"),
  "utf-8"
);

describe("usesLocalOcrFallback", () => {
  it("shows the warning only for the local Tesseract path", () => {
    expect(usesLocalOcrFallback("local")).toBe(true);
  });

  it("hides the warning when Vision AI produced the transcript", () => {
    expect(usesLocalOcrFallback(null)).toBe(false);
  });

  it("hides the warning for absent or unexpected values", () => {
    // A permissive check (truthiness) would show the banner whenever the key
    // exists at all, including ocrFallback: null responses.
    expect(usesLocalOcrFallback(undefined)).toBe(false);
    expect(usesLocalOcrFallback("vision")).toBe(false);
    expect(usesLocalOcrFallback("")).toBe(false);
    expect(usesLocalOcrFallback(true)).toBe(false);
  });
});

describe("warning banner wiring", () => {
  it("reads ocrFallback from the parse response", () => {
    expect(SOURCE).toContain(
      'setOcrFallback(usesLocalOcrFallback(body.ocrFallback) ? "local" : null)'
    );
  });

  it("renders the banner inside the review stage, guarded by the predicate", () => {
    const guard = SOURCE.indexOf("usesLocalOcrFallback(ocrFallback) &&");
    const reviewHeading = SOURCE.indexOf("{copy.review} ({rows.length})");
    const confirmButton = SOURCE.indexOf("onClick={() => onConfirm(rows)}");
    expect(guard).toBeGreaterThan(-1);
    // Above the heading and well before the confirm button: the user must see
    // it before committing, not after.
    expect(guard).toBeLessThan(reviewHeading);
    expect(guard).toBeLessThan(confirmButton);
  });

  it("clears a stale warning when a new analysis starts or is discarded", () => {
    const handleParseStart = SOURCE.indexOf("async function handleParse()");
    const resetOnParse = SOURCE.indexOf("setOcrFallback(null);", handleParseStart);
    const fetchCall = SOURCE.indexOf('fetch("/api/setlists/parse"', handleParseStart);
    expect(resetOnParse).toBeGreaterThan(-1);
    // Reset before the request so a previous local-OCR result can never leak
    // into a freshly parsed (Vision AI) review.
    expect(resetOnParse).toBeLessThan(fetchCall);
    // The "Start over" control drops rows + raw text, so the warning must go too.
    expect(SOURCE).toMatch(
      /setRows\(\[\]\); setRawText\(""\); setOcrFallback\(null\);/
    );
  });

  it("provides localized banner copy in both languages", () => {
    expect(SOURCE.match(/localOcr:/g)?.length).toBe(2);
    expect(SOURCE.match(/localOcrHint:/g)?.length).toBe(2);
    expect(SOURCE).toContain("role=\"status\"");
  });
});
