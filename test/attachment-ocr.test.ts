import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isOcrEligible, toInlineImage, MAX_OCR_CHARS } from "@/lib/attachment-ocr";

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