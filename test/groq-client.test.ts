import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GROQ_MODELS,
  callGroq,
  describeGroqFailure,
  isModelUnavailable,
  parseModelJson,
  preferredModel,
} from "@/lib/groq";

/**
 * The regression these tests protect: Groq deprecates model ids without notice.
 * A retired id answers 404 / "model_not_found", and before the fallback chain
 * that broke every AI feature in the app at once.
 */
function groqResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  };
}

describe("groq model registry", () => {
  it("prefers llama-3.3-70b-versatile for text", () => {
    expect(preferredModel("text")).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODELS.text[0]).toBe("llama-3.3-70b-versatile");
  });

  it("falls back to llama-3.1-8b-instant for text", () => {
    expect(GROQ_MODELS.text).toContain("llama-3.1-8b-instant");
  });

  it("only lists currently supported models", () => {
    // Retired ids were dropped in v1.33.2: keeping them only costs a failed
    // round-trip per request before the chain reaches a model that works.
    expect(GROQ_MODELS.text).toEqual([
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ]);
    expect(GROQ_MODELS.vision).toEqual([
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview",
    ]);

    for (const family of ["text", "vision"] as const) {
      for (const model of GROQ_MODELS[family]) {
        expect(model).not.toMatch(/mixtral|llama3-/);
      }
    }
  });

  it("reports an exhausted chain instead of blaming the last model", () => {
    const message = describeGroqFailure(
      404,
      '{"error":{"code":"model_not_found","message":"model not found"}}',
      "llama-3.1-8b-instant",
      ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    );
    expect(message).toMatch(/none of the configured groq models/i);
    expect(message).toContain("llama-3.3-70b-versatile");
    expect(message).toContain("llama-3.1-8b-instant");
  });

  it("blames a single model when only one was tried", () => {
    const message = describeGroqFailure(404, "model_not_found", "llama-3.3-70b-versatile", [
      "llama-3.3-70b-versatile",
    ]);
    expect(message).toMatch(/no longer available/i);
    expect(message).not.toMatch(/none of the configured/i);
  });

  it("prefers auth and rate-limit guidance over the chain message", () => {
    const attempted = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    expect(describeGroqFailure(401, "invalid api key", "llama-3.1-8b-instant", attempted))
      .toMatch(/GROQ_API_KEY/);
    expect(describeGroqFailure(429, "rate limit exceeded", "llama-3.1-8b-instant", attempted))
      .toMatch(/rate-limiting/i);
  });

  it("has at least two vision candidates", () => {
    expect(GROQ_MODELS.vision.length).toBeGreaterThanOrEqual(2);
    expect(GROQ_MODELS.vision[0]).toBe("llama-3.2-11b-vision-preview");
  });
});

describe("isModelUnavailable", () => {
  it("detects 404", () => {
    expect(isModelUnavailable(404, "")).toBe(true);
  });

  it("detects model_not_found and decommissioned payloads", () => {
    expect(isModelUnavailable(400, '{"error":{"code":"model_not_found"}}')).toBe(true);
    expect(isModelUnavailable(400, "This model has been decommissioned")).toBe(true);
    expect(isModelUnavailable(400, "invalid model for this key")).toBe(true);
  });

  it("detects invalid_request_error when it names the model", () => {
    expect(
      isModelUnavailable(
        400,
        '{"error":{"code":"invalid_request_error","message":"The model llama-3.3-70b-versatile is not available"}}'
      )
    ).toBe(true);
  });

  it("does not treat an unrelated 400 as a model problem", () => {
    expect(
      isModelUnavailable(400, '{"error":{"code":"invalid_request_error","message":"messages is required"}}')
    ).toBe(false);
    expect(isModelUnavailable(400, '{"error":{"code":"invalid_request_error","message":"max_tokens too large"}}')).toBe(false);
  });

  it("does not treat auth, rate limit or 5xx as a model problem", () => {
    expect(isModelUnavailable(401, "invalid api key")).toBe(false);
    expect(isModelUnavailable(429, "rate limit exceeded")).toBe(false);
    expect(isModelUnavailable(503, "service unavailable")).toBe(false);
  });
});

describe("describeGroqFailure", () => {
  it("turns a retired model into actionable guidance", () => {
    const msg = describeGroqFailure(404, "", "llama-3.3-70b-versatile");
    expect(msg).toContain("llama-3.3-70b-versatile");
    expect(msg).toContain("GROQ_MODELS");
    // Must not leak the raw JSON blob.
    expect(msg).not.toContain("{");
  });

  it("explains a rejected key", () => {
    expect(describeGroqFailure(401, "invalid api key", "m")).toContain("GROQ_API_KEY");
  });

  it("explains rate limiting", () => {
    expect(describeGroqFailure(429, "", "m")).toMatch(/rate-limit/i);
  });

  it("never returns a raw JSON payload", () => {
    const raw = '{"error":{"message":"boom","code":"x"}}';
    const msg = describeGroqFailure(400, raw, "m");
    expect(msg).not.toContain("error\":");
  });
});

describe("callGroq model fallback", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the preferred model when it works", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("hello"));
    const out = await callGroq([{ role: "user", content: "hi" }], { family: "text" });
    expect(out).toBe("hello");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
  });

  it("retries with the fallback when the preferred model is gone", async () => {
    fetchMock
      .mockResolvedValueOnce(
        groqResponse(404, { error: { code: "model_not_found" } })
      )
      .mockResolvedValueOnce(okResponse("from fallback"));

    const out = await callGroq([{ role: "user", content: "hi" }], { family: "text" });
    expect(out).toBe("from fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.model).toBe("llama-3.1-8b-instant");
  });

  it("does NOT retry on an auth failure", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(401, { error: "invalid api key" }));
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/GROQ_API_KEY/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a rate limit", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(429, { error: "rate limit" }));
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/rate-limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after every vision candidate is unavailable", async () => {
    fetchMock.mockResolvedValue(
      groqResponse(404, { error: { code: "model_not_found" } })
    );
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "vision" })
    ).rejects.toThrow(/no longer available/i);
    expect(fetchMock).toHaveBeenCalledTimes(GROQ_MODELS.vision.length);
  });

  it("honours an explicit model and skips the chain", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("pinned"));
    await callGroq([{ role: "user", content: "hi" }], { model: "custom-model" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("custom-model");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing key as a configuration error", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(
      callGroq([{ role: "user", content: "hi" }])
    ).rejects.toThrow(/GROQ_API_KEY/);
  });
});

describe("parseModelJson", () => {
  it("parses plain, fenced and prose-wrapped JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseModelJson('Here you go: {"a":3} done')).toEqual({ a: 3 });
  });

  it("returns null for unusable output", () => {
    expect(parseModelJson("not json at all")).toBeNull();
  });
});
