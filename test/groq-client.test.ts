import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GROQ_MODELS,
  callGroq,
  describeGroqFailure,
  isModelUnavailable,
  parseModelJson,
  preferredModel,
  candidatesFor,
  chatCandidatesFrom,
  getGroqModelName,
  listAvailableModels,
} from "@/lib/groq";

/** fetch stub shared by the pure-predicate suites below. */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GROQ_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

/** Response shape of `GET /openai/v1/models`, which is not a chat envelope. */
function modelsResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
    text: async () => JSON.stringify({ data: ids.map((id) => ({ id })) }),
  };
}

describe("groq model registry", () => {
  it("prefers llama3-70b-8192 for text", () => {
    // v1.41.0: the default was llama-3.3-70b-versatile. Keys not scoped to that
    // id could not reach any AI feature, so the broadly-available 70B became the
    // default and the flagship moved to the end of the chain.
    expect(preferredModel("text")).toBe("llama3-70b-8192");
    expect(GROQ_MODELS.text[0]).toBe("llama3-70b-8192");
    // The old default is still reachable, just no longer first.
    expect(GROQ_MODELS.fallback.text).toContain("llama-3.3-70b-versatile");
  });

  it("falls back through the text chain when the primary is unavailable", () => {
    // v1.39.0 reversed v1.34.0, which removed this. The old rationale was that
    // a second failing request produced the same error — true only while the
    // primary was a fixed id on the same key. Once GROQ_MODEL_NAME can point at
    // an org-scoped or revoked model, one candidate failing says nothing about
    // the next, and the chain turns a dead AI feature into a working one.
    expect(candidatesFor("text")).toEqual([
      "llama3-70b-8192",
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
    ]);
  });

  it("de-duplicates when GROQ_MODEL_NAME names a fallback model", () => {
    const original = process.env.GROQ_MODEL_NAME;
    try {
      process.env.GROQ_MODEL_NAME = "llama-3.1-8b-instant";
      // Overriding to a chain member must not retry that same model twice. The
      // override replaces the primary; the static fallback list still follows.
      expect(candidatesFor("text")).toEqual([
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
      ]);
    } finally {
      if (original === undefined) delete process.env.GROQ_MODEL_NAME;
      else process.env.GROQ_MODEL_NAME = original;
    }
  });

  it("still falls back for vision, where a second attempt pays off", () => {
    expect(candidatesFor("vision")).toEqual([
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview",
    ]);
  });

  it("honours GROQ_MODEL_NAME as the text primary", () => {
    const original = process.env.GROQ_MODEL_NAME;
    try {
      process.env.GROQ_MODEL_NAME = "llama-3.1-8b-instant";
      expect(preferredModel("text")).toBe("llama-3.1-8b-instant");
      expect(candidatesFor("text")[0]).toBe("llama-3.1-8b-instant");

      // Vision is never overridden: a text model cannot read an image.
      expect(preferredModel("vision")).toBe("llama-3.2-11b-vision-preview");
    } finally {
      if (original === undefined) delete process.env.GROQ_MODEL_NAME;
      else process.env.GROQ_MODEL_NAME = original;
    }
  });

  it("ignores a blank GROQ_MODEL_NAME", () => {
    const original = process.env.GROQ_MODEL_NAME;
    try {
      process.env.GROQ_MODEL_NAME = "   ";
      expect(preferredModel("text")).toBe("llama3-70b-8192");
    } finally {
      if (original === undefined) delete process.env.GROQ_MODEL_NAME;
      else process.env.GROQ_MODEL_NAME = original;
    }
  });

  it("only lists currently supported models", () => {
    // Retired ids were dropped in v1.33.2; v1.33.3 split primary from fallback.
    expect(GROQ_MODELS.text).toEqual(["llama3-70b-8192"]);
    expect(GROQ_MODELS.vision).toEqual(["llama-3.2-11b-vision-preview"]);

    const all = [
      ...GROQ_MODELS.text,
      ...GROQ_MODELS.vision,
      ...GROQ_MODELS.fallback.vision,
    ];
    for (const model of all) {
      // llama3-70b-8192 became the text default in v1.41.0, so it is no longer
      // in the retired family; the genuinely gone ones are mixtral and moondream.
      expect(model).not.toMatch(/mixtral|moondream/);
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
    // model_not_found means the key cannot use it, so the access-scoped
    // message is the accurate one here.
    expect(message).toMatch(/cannot use/i);
    expect(message).not.toMatch(/none of the configured/i);
  });

  it("still reports a retirement when no access wording is present", () => {
    const message = describeGroqFailure(
      404,
      '{"error":{"code":"model_decommissioned","message":"the requested model is decommissioned"}}',
      "llama-3.3-70b-versatile",
      ["llama-3.3-70b-versatile"]
    );
    expect(message).toMatch(/no longer available/i);
  });

  it("prefers auth and rate-limit guidance over the chain message", () => {
    const attempted = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    expect(describeGroqFailure(401, "invalid api key", "llama-3.1-8b-instant", attempted))
      .toMatch(/GROQ_API_KEY/);
    expect(describeGroqFailure(429, "rate limit exceeded", "llama-3.1-8b-instant", attempted))
      .toMatch(/rate-limiting/i);
  });

  it("has a vision primary plus a defensive fallback", () => {
    expect(GROQ_MODELS.vision[0]).toBe("llama-3.2-11b-vision-preview");
    expect(GROQ_MODELS.fallback.vision).toEqual(["llama-3.2-90b-vision-preview"]);
  });

  it("explains a missing key permission instead of leaking the trace", () => {
    const message = describeGroqFailure(
      400,
      '{"error":{"code":"invalid_request_error","message":"The model llama-3.1-8b-instant is not enabled for your organization"}}',
      "llama-3.1-8b-instant"
    );
    expect(message).toMatch(/cannot use/i);
    expect(message).toContain("GROQ_MODEL_NAME");
    expect(message).not.toContain("invalid_request_error");
    expect(message).not.toContain('{"error"');
  });

  it("recognises a 404 model_not_found as an access problem", () => {
    const message = describeGroqFailure(
      404,
      '{"error":{"code":"model_not_found","message":"model not found"}}',
      "llama-3.3-70b-versatile"
    );
    expect(message).toMatch(/cannot use/i);
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

describe("getGroqModelName (v1.41.0)", () => {
  it("is the single place the env override is read", () => {
    const original = process.env.GROQ_MODEL_NAME;
    try {
      // Unset: the broadly-available default, never the id that caused the
      // "your key does not have access" reports.
      delete process.env.GROQ_MODEL_NAME;
      expect(getGroqModelName()).toBe("llama3-70b-8192");

      process.env.GROQ_MODEL_NAME = "some-other-model";
      expect(getGroqModelName()).toBe("some-other-model");

      // Vision is never redirected by a text override.
      expect(getGroqModelName("vision")).toBe("llama-3.2-11b-vision-preview");
    } finally {
      if (original === undefined) delete process.env.GROQ_MODEL_NAME;
      else process.env.GROQ_MODEL_NAME = original;
    }
  });

  it("never defaults to the model that broke AI for scoped keys", () => {
    const original = process.env.GROQ_MODEL_NAME;
    try {
      delete process.env.GROQ_MODEL_NAME;
      expect(getGroqModelName()).not.toBe("llama-3.3-70b-versatile");
      expect(candidatesFor("text")).toContain("llama3-70b-8192");
    } finally {
      if (original === undefined) delete process.env.GROQ_MODEL_NAME;
      else process.env.GROQ_MODEL_NAME = original;
    }
  });
});

describe("listAvailableModels", () => {
  it("returns nothing rather than throwing when the listing fails", async () => {
    // Discovery must never replace a useful error with a network error.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(listAvailableModels("k")).resolves.toEqual([]);
  });

  it("returns nothing when the request throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(listAvailableModels("k")).resolves.toEqual([]);
  });

  it("pulls ids out of the data envelope", async () => {
    fetchMock.mockResolvedValueOnce(modelsResponse(["a-model", "another-model"]));
    await expect(listAvailableModels("k")).resolves.toEqual(["a-model", "another-model"]);
  });
});

describe("chatCandidatesFrom", () => {
  const feed = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama-3.2-11b-vision-preview",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "whisper-large-v3",
    "groq-guard-llama-3-70b",
    "text-embedding-ada-002",
    "compound-beta-mini",
  ];

  it("keeps only chat models for text calls", () => {
    expect(chatCandidatesFrom(feed, "text")).toEqual([
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ]);
  });

  it("keeps only vision models for vision calls", () => {
    expect(chatCandidatesFrom(feed, "vision")).toEqual([
      "llama-3.2-11b-vision-preview",
    ]);
  });

  it("drops non-chat endpoints that would fail against /chat/completions", () => {
    const out = chatCandidatesFrom(feed, "text");
    for (const id of ["whisper-large-v3", "groq-guard-llama-3-70b", "text-embedding-ada-002", "compound-beta-mini"]) {
      expect(out).not.toContain(id);
    }
  });

  it("returns nothing for an empty or malformed feed", () => {
    expect(chatCandidatesFrom([], "text")).toEqual([]);
    expect(chatCandidatesFrom([null as any, 42 as any, {} as any], "text")).toEqual([]);
  });
});

describe("model discovery (v1.41.0)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers with a model the key can actually reach", async () => {
    // Every configured id is rejected, but /models advertises a working one.
    // This is the guarantee: the app is never pinned to the registry.
    fetchMock
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } })) // llama3-70b-8192
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } })) // llama-3.1-8b-instant
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } })) // llama-3.3-70b-versatile
      .mockResolvedValueOnce(
        modelsResponse(["llama-3.3-70b-versatile", "gemma2-9b-it"])
      )
      .mockResolvedValueOnce(okResponse("recovered"));

    const out = await callGroq([{ role: "user", content: "hi" }], { family: "text" });
    expect(out).toBe("recovered");

    // The retry used a discovered id, not one from the registry.
    const discoveryCall = fetchMock.mock.calls[candidatesFor("text").length];
    expect(String(discoveryCall[0])).toContain("/models");

    const finalBody = JSON.parse(
      fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body
    );
    expect(finalBody.model).toBe("gemma2-9b-it");
  });

  it("does not rediscover a model it already tried", async () => {
    fetchMock.mockResolvedValue(
      groqResponse(404, { error: { code: "model_not_found" } })
    );
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/None of the configured Groq models responded/i);

    // Only the static chain plus one discovery probe — no duplicate retries.
    expect(fetchMock).toHaveBeenCalledTimes(candidatesFor("text").length + 1);
  });

  it("does not discover when the failure was an auth problem", async () => {
    // A 401 is about the key, not the model; probing /models would waste a call
    // and could not help.
    fetchMock.mockResolvedValueOnce(groqResponse(401, { error: "invalid api key" }));
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/GROQ_API_KEY/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips discovery when the caller pinned an explicit model", async () => {
    fetchMock.mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } }));
    await expect(
      callGroq([{ role: "user", content: "hi" }], { model: "some-pinned-model" })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives a failing /models call", async () => {
    fetchMock
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}), text: async () => "" });

    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/None of the configured Groq models responded/i);
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
    expect(body.model).toBe("llama3-70b-8192");
  });

  it("walks the text chain when the primary model is retired", async () => {
    // v1.39.0 restores the chain text lost in v1.34.0. A 404 primary says
    // nothing about whether the next candidate can serve, so try it.
    fetchMock
      .mockResolvedValueOnce(groqResponse(404, { error: { code: "model_not_found" } }))
      .mockResolvedValueOnce(okResponse("from fallback"));

    const out = await callGroq([{ role: "user", content: "hi" }], { family: "text" });

    expect(out).toBe("from fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.model).toBe("llama-3.1-8b-instant");
  });

  it("reports an exhausted chain as a chain, not as one bad model", async () => {
    // v1.41.0 regression. `attempted` was only ever given the last failure, so
    // this reported itself as a single-model access problem naming whichever
    // model failed last — which is the confusing error users reported seeing
    // even after three models had been tried.
    fetchMock.mockResolvedValue(
      groqResponse(404, { error: { code: "model_not_found" } })
    );
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "text" })
    ).rejects.toThrow(/None of the configured Groq models responded/i);

    // Every candidate tried, plus the /models discovery call that found nothing.
    expect(fetchMock).toHaveBeenCalledTimes(candidatesFor("text").length + 1);
  });

  it("succeeds on exactly one call when the text model works", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("hello"));
    const out = await callGroq([{ role: "user", content: "hi" }], { family: "text" });
    expect(out).toBe("hello");
    // No secondary request, ever.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clean message when every text model lacks access", async () => {
    // The real-world shape: a 400 invalid_request_error saying the model is
    // not enabled. It must not surface as a raw trace, even after the chain
    // has been walked to the end.
    fetchMock.mockResolvedValue(
      groqResponse(400, {
        error: {
          code: "invalid_request_error",
          message: "The model llama-3.3-70b-versatile is not enabled for your organization",
        },
      })
    );
    await expect(
      callGroq([{ role: "user", content: "hi" }])
    ).rejects.toThrow(/None of the configured Groq models responded/i);
    expect(fetchMock).toHaveBeenCalledTimes(candidatesFor("text").length + 1);
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
    // Both vision candidates were tried, and discovery found nothing usable, so
    // the chain-exhausted message is what surfaces — not a single-model one.
    await expect(
      callGroq([{ role: "user", content: "hi" }], { family: "vision" })
    ).rejects.toThrow(/None of the configured Groq models responded/i);
    expect(fetchMock).toHaveBeenCalledTimes(candidatesFor("vision").length + 1);
  });

  it("falls back for vision when the primary is not enabled for the key", async () => {
    // Vision keeps its fallback: a second attempt is worth it there.
    fetchMock
      .mockResolvedValueOnce(
        groqResponse(400, {
          error: {
            code: "invalid_request_error",
            message: "The model llama-3.2-11b-vision-preview is not enabled for your organization",
          },
        })
      )
      .mockResolvedValueOnce(okResponse("served by fallback"));

    const result = await callGroq([{ role: "user", content: "hi" }], { family: "vision" });
    expect(result).toBe("served by fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
