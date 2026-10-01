/**
 * Server-side text extraction for uploaded gig documents.
 *
 * Images are NOT handled here — those go straight to Groq's vision model, which
 * is more accurate (and cheaper) than running a local OCR engine.
 *
 * PDFs are parsed with the `pdfjs-dist` legacy build, which is already a
 * project dependency (used by the in-app PDF viewer). Every failure is
 * swallowed: a document we cannot read should degrade the summary, never break
 * the request.
 */

const MAX_PDF_CHARS = 20_000;
const MAX_PDF_PAGES = 25;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import keeps pdf.js out of the module graph of every route that
    // merely imports this module.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // pdf.js expects a couple of DOM globals to exist. The legacy build only
    // touches them for font/canvas work, which text extraction never does, but
    // it still feature-detects them, so provide harmless stubs.
    const globalAny = globalThis as Record<string, unknown>;
    if (!globalAny.DOMMatrix) {
      globalAny.DOMMatrix = class DOMMatrixStub {};
    }
    if (!globalAny.ImageData) {
      globalAny.ImageData = class ImageDataStub {};
    }
    if (!globalAny.Path2D) {
      globalAny.Path2D = class Path2DStub {};
    }

    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    } as Parameters<typeof pdfjs.getDocument>[0]);

    const doc = await task.promise;
    const parts: string[] = [];
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) parts.push(`--- page ${pageNumber} ---\n${pageText}`);
      page.cleanup();

      if (parts.join("").length >= MAX_PDF_CHARS) break;
    }

    // `destroy` exists on the proxy at runtime but is missing from the typings.
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();

    const text = parts.join("\n\n").slice(0, MAX_PDF_CHARS);
    // A PDF made purely of scans yields no text layer.
    return text.trim().length > 0 ? text.trim() : "";
  } catch (error) {
    console.warn(
      "[document-text] PDF text extraction failed:",
      error instanceof Error ? error.message : error
    );
    return "";
  }
}