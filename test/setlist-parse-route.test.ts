import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/setlists/parse: auth guard, fuzzy matching thresholds and the
 * local-OCR fallback flag.
 *
 * Prisma, auth, Groq and the local OCR runner are mocked so the route's own
 * branching is exercised: 401 without a user, high-confidence links (0.8+)
 * that wire a songId, low-confidence suggestions (0.5-0.8) that stay
 * unlinked, and the "local" flag when vision is unavailable but Tesseract
 * reads the photo.
 */

const getUserIdFromHeaderMock = vi.fn();
const songsFindManyMock = vi.fn();
const callGroqMock = vi.fn();
const extractTextLocallyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    songs: { findMany: songsFindManyMock },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  getUserIdFromHeader: getUserIdFromHeaderMock,
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));

vi.mock("@/lib/groq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/groq")>();
  return { ...actual, callGroq: callGroqMock, isGroqConfigured: () => true };
});

vi.mock("@/lib/local-ocr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-ocr")>();
  return { ...actual, extractTextLocally: extractTextLocallyMock };
});

function jsonRequest(body: unknown): any {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "test-key";
  getUserIdFromHeaderMock.mockReturnValue("supabase-user-1");
  songsFindManyMock.mockResolvedValue([
    { id: "song-1", title: "Bohemian Rhapsody" },
    { id: "song-2", title: "Hotel California" },
  ]);
});

describe("POST /api/setlists/parse", () => {
  it("rejects unauthenticated requests with 401", async () => {
    getUserIdFromHeaderMock.mockReturnValueOnce(null);
    const { POST } = await import("@/app/api/setlists/parse/route");
    const res = await POST(jsonRequest({ text: "1. Bohemian Rhapsody" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("links exact library matches and leaves misses unlinked", async () => {
    callGroqMock.mockResolvedValueOnce(
      JSON.stringify({
        items: [{ title: "Bohemian Rhapsody" }, { title: "A Brand New Song" }],
      })
    );
    const { POST } = await import("@/app/api/setlists/parse/route");
    const res = await POST(
      jsonRequest({ text: "1. Bohemian Rhapsody\n2. A Brand New Song" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].match).toEqual(
      expect.objectContaining({ songId: "song-1", confidence: "high" })
    );
    expect(body.items[1].match).toBeNull();
  });

  it("surfaces near-matches as low-confidence suggestions without linking", async () => {
    // 0.625 similarity: close enough to suggest (>= 0.5) but below the 0.8
    // auto-link threshold. (Deliberately not "Hotel Californ" — that scores
    // 0.875 and auto-links.)
    callGroqMock.mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "Hotel Colorado" }] })
    );
    const { POST } = await import("@/app/api/setlists/parse/route");
    const res = await POST(jsonRequest({ text: "1. Hotel Colorado" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].match).toEqual(
      expect.objectContaining({ songId: "song-2", confidence: "low" })
    );
    // A suggestion must not link: the modal only wires songId for "high".
    expect(body.items[0].match.songId).toBe("song-2");
  });

  it("flags the response when local OCR replaces unreachable Vision AI", async () => {
    // The Groq client surfaces an unusable vision model as an error with a
    // 403/404 status (see isVisionModelUnavailable) — a 400 must rethrow
    // instead of falling back.
    const visionError = new Error(
      'Your Groq key cannot use "llama-3.2-11b-vision-instruct", so AI features cannot run.'
    );
    (visionError as { status?: number }).status = 403;
    callGroqMock.mockRejectedValueOnce(visionError);
    extractTextLocallyMock.mockResolvedValueOnce({
      outcome: "ok",
      text: "1. Bohemian Rhapsody",
    });
    callGroqMock.mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "Bohemian Rhapsody" }] })
    );
    const { POST } = await import("@/app/api/setlists/parse/route");
    const res = await POST(
      jsonRequest({ imageDataUrl: "data:image/png;base64,AAA" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ocrFallback).toBe("local");
    expect(body.items[0].match).toEqual(
      expect.objectContaining({ songId: "song-1", confidence: "high" })
    );
  });

  it("inherits library song metadata into the parse result for linked songs", async () => {
    songsFindManyMock.mockResolvedValue([
      {
        id: "song-1",
        title: "Bohemian Rhapsody",
        notes:
          "[[song-meta]]{\"keySignature\": \"A\", \"bpm\": \"150\", \"comments\": \"piano\\\":\\\"ist\"}[[/song-meta]] body",
      },
      { id: "song-2", title: "Hotel California" },
    ]);
    callGroqMock.mockResolvedValueOnce(
      JSON.stringify({ items: [{ title: "Bohemian Rhapsody" }, { title: "A Brand New Song" }] })
    );
    const { POST } = await import("@/app/api/setlists/parse/route");
    const res = await POST(
      jsonRequest({ text: "1. Bohemian Rhapsody\n2. A Brand New Song" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].match).toEqual(
      expect.objectContaining({ songId: "song-1", confidence: "high" })
    );
    // The linked song inherits the library metadata into `details`.
    expect(body.items[0].details).toEqual(
      expect.objectContaining({
        key: "A",
        bpm: 150,
        notes: "piano\":\"ist",
      })
    );
    // Unlinked items keep only the raw parsed fields and no inherited details.
    expect(body.items[1].match).toBeNull();
    expect(body.items[1].details).toEqual({
      key: null,
      bpm: null,
      tuning: null,
      duration: null,
      notes: null,
    });
  });

  it("extracts song metadata from the [[song-meta]] JSON block", async () => {
    const { parseSongMetaFromNotes } = await import("@/lib/song-meta");
    const notes =
          "[[song-meta]]{\"keySignature\": \"A\", \"bpm\": \"150\", \"comments\": \"piano:ist\"}[[/song-meta]] body";
    const meta = parseSongMetaFromNotes(notes);
    expect(meta).toEqual({ keySignature: "A", bpm: "150", comments: "piano:ist" });
  });

  it("returns null when the [[song-meta]] block is missing", async () => {
    const { parseSongMetaFromNotes } = await import("@/lib/song-meta");
    expect(parseSongMetaFromNotes("just a plain body")).toBeNull();
  });
});
