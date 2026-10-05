import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isOcrEligible,
  toInlineImage,
  extractImageText,
  MAX_OCR_CHARS,
} from "@/lib/attachment-ocr";
import {
  extractTextLocally,
  isVisionModelUnavailable,
  resetLocalOcrWorker,
  type LocalOcrRunner,
} from "@/lib/local-ocr";
import { GroqError } from "@/lib/groq";

/**
 * v1.45.0 — local OCR fallback.
 *
 * The runner is always injected: letting a test reach the real Tesseract would
 * download ~10MB of language data and boot WASM, which is slow, network
 * dependent, and would make a unit test depend on a CDN. What is under test is
 * the decision logic — when to fall back, what to do with the result, and how
 * failures propagate.
 */

const png = Buffer.from("89504e470d0a1a0a", "hex");

describe("isVisionModelUnavailable", () => {
  it("recognises the shapes Groq actually returns", () => {
    expect(
      isVisionModelUnavailable(
        new GroqError('The AI model "llama-3.2-11b-vision-instruct" is no longer available on this Groq account.', 404)
      )
    ).toBe(true);
    expect(
      isVisionModelUnavailable(new GroqError('Your Groq key cannot use "x".', 403))
    ).toBe(true);
    expect(
      isVisionModelUnavailable(
        // The real chain-exhausted message, in full: the "looks retired or
        // unavailable" clause is what carries the meaning, so a truncated
        // fixture would not exercise the rule at all.
        new GroqError(
          "None of the configured Groq models responded (tried: llama-3.2-11b-vision-instruct). Every model in the chain looks retired or unavailable to this key.",
          404
        )
      )
    ).toBe(true);
  });

  it("ignores failures that local OCR cannot fix", () => {
    // A bad key, a rate limit and a timeout are all things Tesseract would not
    // help with; trying anyway would just double the latency.
    expect(isVisionModelUnavailable(new GroqError("GROQ_API_KEY is missing", 503))).toBe(false);
    expect(isVisionModelUnavailable(new GroqError("Rate-limited, try later", 429))).toBe(false);
    expect(isVisionModelUnavailable(new GroqError("The AI took too long", 504))).toBe(false);
    expect(isVisionModelUnavailable(new Error("network down"))).toBe(false);
    expect(isVisionModelUnavailable(null)).toBe(false);
    expect(isVisionModelUnavailable(undefined)).toBe(false);
  });

  it("requires a 403/404 when a status is present", () => {
    // Same wording, but a 429 is a rate limit and not a model problem.
    expect(
      isVisionModelUnavailable(
        new GroqError("rate limit: model is not available", 429)
      )
    ).toBe(false);
  });
});

describe("extractTextLocally", () => {
  beforeEach(() => {
    resetLocalOcrWorker();
  });

  it("returns the runner's text", async () => {
    const runner: LocalOcrRunner = async () => "1. Alpha\n2. Beta";
    await expect(extractTextLocally(png, runner)).resolves.toEqual({
      outcome: "ok",
      text: "1. Alpha\n2. Beta",
    });
  });

  it("reports a blank image as empty, not as a failure", async () => {
    const runner: LocalOcrRunner = async () => null;
    await expect(extractTextLocally(png, runner)).resolves.toEqual({
      outcome: "empty",
      text: null,
    });
  });

  it("reports an unusable engine as unavailable instead of throwing", async () => {
    // Tesseract can fail to boot in a serverless function. That must not become
    // an exception in the middle of an upload.
    const runner: LocalOcrRunner = async () => {
      throw new Error("eng.traineddata not found");
    };
    await expect(extractTextLocally(png, runner)).resolves.toEqual({
      outcome: "unavailable",
      text: null,
    });
  });

  it("does not start an engine for an empty buffer", async () => {
    const runner = vi.fn();
    await expect(extractTextLocally(Buffer.alloc(0), runner)).resolves.toEqual({
      outcome: "empty",
      text: null,
    });
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("isOcrEligible", () => {
  it("accepts the image types we send to the vision model", () => {
    expect(isOcrEligible("image/png")).toBe(true);
    expect(isOcrEligible("image/jpeg")).toBe(true);
    expect(isOcrEligible("image/webp")).toBe(true);
  });

  it("tolerates casing, padding and the legacy jpg alias", () => {
    expect(isOcrEligible(" IMAGE/PNG ")).toBe(true);
    expect(isOcrEligible("image/jpg")).toBe(true);
  });

  it("rejects non-images and missing types", () => {
    expect(isOcrEligible("application/pdf")).toBe(false);
    expect(isOcrEligible(null)).toBe(false);
    expect(isOcrEligible(undefined)).toBe(false);
    expect(isOcrEligible("")).toBe(false);
  });
});

describe("toInlineImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes an existing data URL straight through without a fetch", async () => {
    const inline = "data:image/png;base64,AAAA";
    await expect(toInlineImage(inline)).resolves.toBe(inline);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads a Supabase Storage URL and inlines it", async () => {
    // This is the case that used to be silently dropped: attachments live in
    // Storage, so their url is remote and the old data:-only filter skipped
    // every one of them.
    fetchMock.mockResolvedValue(
      new Response(Buffer.from("fake-image-bytes"), {
        headers: { "content-type": "image/png" },
      })
    );

    const result = await toInlineImage(
      "https://project.supabase.co/storage/v1/object/public/gigs/contract.png"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(result).toContain(Buffer.from("fake-image-bytes").toString("base64"));
  });

  it("honours the response content-type rather than the file extension", async () => {
    fetchMock.mockResolvedValue(
      new Response(Buffer.from("jpeg-bytes"), { headers: { "content-type": "image/jpeg" } })
    );
    const result = await toInlineImage("https://example.com/photo.png");
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns null when the fetch fails, so a summary is not blocked", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(toInlineImage("https://example.com/x.png")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(toInlineImage("https://example.com/x.png")).resolves.toBeNull();
  });

  it("returns null when the URL is not actually an image", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>", { headers: { "content-type": "text/html" } })
    );
    await expect(toInlineImage("https://example.com/x.png")).resolves.toBeNull();
  });

  it("refuses to inline anything over the size ceiling", async () => {
    fetchMock.mockResolvedValue(
      new Response(Buffer.from("big"), { headers: { "content-type": "image/png" } })
    );
    const result = await toInlineImage("https://example.com/big.png", 2);
    expect(result).toBeNull();
  });
});

describe("MAX_OCR_CHARS", () => {
  it("is bounded so one attachment cannot dominate the prompt", () => {
    expect(MAX_OCR_CHARS).toBeGreaterThan(0);
    expect(MAX_OCR_CHARS).toBeLessThanOrEqual(20_000);
  });
});
describe("extractImageText — local OCR fallback (v1.45.0)", () => {
  const visionMock = vi.fn();

  beforeEach(() => {
    visionMock.mockReset();
    resetLocalOcrWorker();
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", visionMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Makes the whole vision chain answer "this model is gone". */
  function visionUnavailable(status = 404) {
    visionMock.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: { code: "model_not_found", message: "model not found" } }),
      text: async () => "model not found",
    });
  }

  const localRunner = (text: string | null): LocalOcrRunner => async () => text;

  it("falls back to local OCR when no vision model is reachable", async () => {
    visionUnavailable();
    const runner = localRunner("1. Alpha\n2. Beta");

    const text = await extractImageText(png, "image/png", runner);

    expect(text).toBe("1. Alpha\n2. Beta");
    // The local engine was actually asked, not merely imported.
    expect(await runner(png)).toBe("1. Alpha\n2. Beta");
  });

  it("does not start local OCR when the vision model answered", async () => {
    visionMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "from vision" } }] }),
      text: async () => "from vision",
    });
    const runner = vi.fn();

    await expect(extractImageText(png, "image/png", runner)).resolves.toBe("from vision");
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not fall back when the image was simply blank", async () => {
    // NO_TEXT_FOUND means the model read it and there was nothing there. Running
    // Tesseract over a blank page would just waste seconds.
    visionMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "NO_TEXT_FOUND" } }] }),
      text: async () => "NO_TEXT_FOUND",
    });
    const runner = vi.fn();

    await expect(extractImageText(png, "image/png", runner)).resolves.toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not fall back on an auth or rate-limit failure", async () => {
    // Neither is a model problem; Tesseract would not help and the call would
    // take twice as long to fail.
    visionMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limit" }),
      text: async () => "rate limit",
    });
    const runner = vi.fn();

    await expect(extractImageText(png, "image/png", runner)).resolves.toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when local OCR is unavailable too", async () => {
    visionUnavailable();
    const runner: LocalOcrRunner = async () => {
      throw new Error("eng.traineddata not found");
    };

    await expect(extractImageText(png, "image/png", runner)).resolves.toBeNull();
  });

  it("caps fallback text at the shared limit", async () => {
    visionUnavailable();
    const runner = localRunner("x".repeat(MAX_OCR_CHARS + 5000));

    const text = await extractImageText(png, "image/png", runner);
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(MAX_OCR_CHARS);
  });

  it("still refuses an oversized image before touching either engine", async () => {
    const runner = vi.fn();
    const huge = Buffer.alloc(6 * 1024 * 1024 + 1);

    await expect(extractImageText(huge, "image/png", runner)).resolves.toBeNull();
    expect(visionMock).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});