/**
 * Minimal Groq (groq.com) client for server-side use.
 *
 * Kept dependency-free on purpose: Groq exposes an OpenAI-compatible
 * `/openai/v1/chat/completions` endpoint, so a plain `fetch` is enough and we
 * avoid pulling another SDK into the bundle.
 *
 * Required env var: GROQ_API_KEY
 */

/**
 * Model registry.
 *
 * Text prefers `llama3-70b-8192` (or whatever `GROQ_MODEL_NAME` points at) and
 * falls back through the models below before giving up.
 *
 * v1.41.0: the default was llama-3.3-70b-versatile. Accounts whose key is not
 * scoped to that model could not reach *any* AI feature, because it was the
 * first (and, for a long time, the only) candidate. llama3-70b-8192 is the
 * broadly-available 70B, so the first request now lands on a model most keys
 * can actually answer with.
 *
 * The static chain is the fast path. If it is exhausted because every id is
 * unavailable, `listAvailableModels` asks Groq what this key *can* reach and the
 * call is retried against that — so a retired or over-restricted id list
 * degrades to "whatever works" instead of a dead feature.
 *
 * `GROQ_MODEL_NAME` remains the escape hatch for keys scoped elsewhere.
 */
export const GROQ_MODELS = {
  text: ["llama3-70b-8192"] as const,
  vision: ["llama-3.2-11b-vision-preview"] as const,
  /**
   * Ordered by preference. llama-3.1-8b-instant is the last-resort retry that
   * keeps the smallest/scoped keys working at all; the 3.3 flagship is kept at
   * the end so a key that *does* have it is never denied a better model.
   */
  fallback: {
    text: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"] as const,
    vision: ["llama-3.2-90b-vision-preview"] as const,
  },
} as const;

export type GroqModelFamily = "text" | "vision";

/** The last thing that went wrong, kept to shape the final error message. */
type FailureShape = { status: number; body: string; model: string };

/**
 * The model a family prefers when everything is healthy, honouring the
 * `GROQ_MODEL_NAME` override for text calls.
 */
export function preferredModel(family: GroqModelFamily): string {
  if (family === "text") {
    const override = process.env.GROQ_MODEL_NAME?.trim();
    if (override) return override;
  }
  return GROQ_MODELS[family][0];
}

/**
 * Models to try, primary first, de-duplicated.
 *
 * When `GROQ_MODEL_NAME` names something already in the fallback list, it is
 * hoisted to the front and the duplicate dropped, so an operator overriding to
 * a fallback id never retries the same model twice.
 */
export function candidatesFor(family: GroqModelFamily): string[] {
  return Array.from(new Set([preferredModel(family), ...GROQ_MODELS.fallback[family]]));
}

/**
 * The text model id in force right now.
 *
 * The single place a caller should ask "which model are we using?", so the env
 * override is read in exactly one spot rather than being re-derived per route.
 */
export function getGroqModelName(family: GroqModelFamily = "text"): string {
  return preferredModel(family);
}

/** Groq's OpenAI-compatible model listing. */
const MODELS_URL = "https://api.groq.com/openai/v1/models";

/**
 * Model ids Groq lists for this key.
 *
 * This is the escape hatch that stops the app from ever being pinned to a model
 * id that has been retired or that the key is not scoped to. `GET /models`
 * returns what the key can actually reach, so the caller can retry against a
 * working model instead of surfacing an error.
 *
 * Never throws: discovery is an optimisation, and a failure here must leave the
 * normal error reporting intact rather than replace it with a network error.
 */
export async function listAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return [];
    const body = await response.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    return data
      .map((m: any) => (typeof m?.id === "string" ? m.id : ""))
      .filter((id: string) => id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Model ids from `/models` worth retrying a chat completion against.
 *
 * Groq serves far more than chat on the same endpoint, so the list is filtered
 * down to text-to-text models: the moderation, guard, speech-to-text,
 * embedding, rerank and vision ids would all fail against
 * `/chat/completions` and just burn the retry budget.
 */
export function chatCandidatesFrom(available: string[], family: GroqModelFamily): string[] {
  const isVision = (id: string) => /vision|llava|whisper|clip/i.test(id);
  const nonChat = (id: string) =>
    /guard|moderation|safety|whisper|embed|rerank|audio|speech|compound|scim/i.test(id);

  return available.filter((id): id is string => {
    // The feed comes from a remote API, so guard the shape rather than trusting
    // it: a non-string would survive the regex tests (which coerce) and end up
    // as a `model` in the request body.
    if (typeof id !== "string" || id.trim() === "") return false;
    if (nonChat(id)) return false;
    if (family === "vision") return isVision(id);
    return !isVision(id);
  });
}

/**
 * True when the failure means "this model id is unusable here", as opposed to a
 * transport, auth or rate-limit problem which a retry would not fix.
 *
 * `invalid_request_error` is included because Groq returns that generic code for
 * several bad-request shapes, and the only one worth falling through on is an
 * unusable model id. The message check keeps unrelated 400s (bad JSON, missing
 * field, oversized payload) from burning the whole chain.
 */
export function isModelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true;
  const lower = body.toLowerCase();
  if (
    lower.includes("model_not_found") ||
    lower.includes("model_decommissioned") ||
    lower.includes("decommissioned")
  ) {
    return true;
  }
  const looksLikeBadModelId =
    lower.includes("model") &&
    (lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("no longer") ||
      lower.includes("invalid model") ||
      // Access scoping: keys can be granted per model, and Groq phrases the
      // rejection as "not enabled for your organization" / "does not have
      // access" rather than as a 404. Both are still worth walking the chain
      // for, because the next candidate may well be available.
      lower.includes("not available") ||
      lower.includes("not enabled") ||
      lower.includes("does not have access") ||
      lower.includes("no access to"));
  // Groq answers unknown model ids with either a bare 400 or a 400 carrying
  // `code: "invalid_request_error"` plus a descriptive message. Either way the
  // message has to mention the model, so an unrelated 400 never burns the chain.
  return status === 400 && looksLikeBadModelId;
}

/**
 * True when the failure means "this key cannot use this model", which is a
 * different problem from "Groq is unhealthy".
 *
 * Groq reports a few distinct shapes for it: a 404 with `model_not_found`, and
 * a 400 `invalid_request_error` saying the model is not enabled/available for
 * the account. The second one is the common real-world case — keys get scoped
 * per model — and it used to surface as a raw trace.
 */
export function isModelAccessDenied(status: number, body: string): boolean {
  if (!isModelUnavailable(status, body)) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("access") ||
    lower.includes("permission") ||
    lower.includes("not enabled") ||
    lower.includes("not available for") ||
    lower.includes("does not have access") ||
    lower.includes("not authorized") ||
    lower.includes("invalid_request_error") ||
    lower.includes("model_not_found")
  );
}

/**
 * Turns a Groq failure into a message a user can act on, instead of the raw
 * JSON error blob the API returns.
 *
 * `attempted` is every model the chain walked through. When more than one was
 * tried and none answered, the problem is the whole chain rather than the last
 * model, and saying so saves the reader from chasing a single retired id.
 */
export function describeGroqFailure(
  status: number,
  body: string,
  model: string,
  attempted: readonly string[] = []
): string {
  const lower = body.toLowerCase();
  const exhaustedChain =
    attempted.length > 1 &&
    attempted.includes(model) &&
    isModelUnavailable(status, body);

  if (status === 401 || lower.includes("invalid api key")) {
    return "AI is not configured correctly: the GROQ_API_KEY was rejected by Groq. Check the key in your environment settings.";
  }
  if (status === 429 || lower.includes("rate limit")) {
    return "Groq is rate-limiting this account right now. Wait a moment and try again.";
  }
  if (status === 413 || lower.includes("context length") || lower.includes("too long")) {
    return "The document is too large for the AI to process in one go. Try attaching fewer or smaller files.";
  }
  if (exhaustedChain) {
    return `None of the configured Groq models responded (tried: ${attempted.join(
      ", "
    )}). Every model in the chain looks retired or unavailable to this key. Update GROQ_MODELS in src/lib/groq.ts to a model your account can access.`;
  }
  if (isModelAccessDenied(status, body)) {
    return `Your Groq key cannot use "${model}", so AI features cannot run. Enable it for your account at console.groq.com, or set GROQ_MODEL_NAME to a model your key can reach.`;
  }
  if (isModelUnavailable(status, body)) {
    return `The AI model "${model}" is no longer available on this Groq account. Update GROQ_MODELS in src/lib/groq.ts to a model your key can access.`;
  }
  if (status >= 500) {
    return `Groq is having trouble right now (HTTP ${status}). Please try again in a moment.`;
  }
  return `The AI request failed (HTTP ${status}). Please try again.`;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export class GroqError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "GroqError";
    this.status = status;
  }
}

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};


type GroqCompletionOptions = {
  /** Explicit model id. Bypasses the fallback chain. */
  model?: string;
  /**
   * Model family to use (with its fallback chain). Ignored when `model` is set.
   * Defaults to "text".
   */
  family?: GroqModelFamily;
  temperature?: number;
  maxTokens?: number;
  /** Ask the model to answer with a JSON object (response_format). */
  json?: boolean;
  signal?: AbortSignal;
};

type Attempt = {
  ok: boolean;
  content?: string;
  status?: number;
  body?: string;
};

async function runOnce(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  options: { temperature: number; maxTokens: number; json: boolean },
  signal: AbortSignal
): Promise<Attempt> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: await response.text().catch(() => ""),
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, status: 502, body: "empty response" };
  }
  return { ok: true, content: content.trim() };
}

/**
 * Call Groq chat completions and return the assistant message content.
 *
 * Model ids go out of date (Groq deprecates them without notice), so a family
 * resolves to a chain: the preferred model first, then each fallback. A new
 * attempt is only made when the previous failure was specifically "model not
 * available" — auth, rate-limit and transport errors are surfaced as-is,
 * because retrying with another model would not help.
 *
 * Throws a GroqError carrying a user-facing message and an HTTP status.
 */
export async function callGroq(
  messages: GroqMessage[],
  options: GroqCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "AI is not configured on this server. Add GROQ_API_KEY to the environment to enable AI features.",
      503
    );
  }

  const {
    model: explicitModel,
    family = "text",
    temperature = 0.2,
    maxTokens = 1500,
    json = false,
    signal,
  } = options;

  const candidates: string[] = explicitModel
    ? [explicitModel]
    : candidatesFor(family);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  // Models that were actually tried and failed, in order.
  //
  // v1.41.0: this array used to be declared inside the try block and then only
  // ever given the *last* failure, after the loop. So `attempted.length > 1` in
  // describeGroqFailure was unreachable, its "no model in the chain answered"
  // branch was dead code, and an exhausted three-model chain still reported
  // itself as a single-model access problem — naming whichever model happened to
  // fail last. That is the "your key does not have access to <model>" message
  // users were seeing.
  const attempted: string[] = [];
  // Held in an object because `walkChain` mutates it from inside a closure, and
  // TypeScript's control-flow analysis does not track that — reading the bare
  // variable afterwards narrows it to `never`.
  const lastFailure: { current: FailureShape | null } = { current: null };

  /**
   * Try each model in `chain`, returning the first successful content.
   *
   * Returns null when every model failed or the chain is exhausted. Throws only
   * for abort/transport errors, which are the caller's problem either way.
   */
  const walkChain = async (
    chain: string[],
    warnBase?: string
  ): Promise<string | null> => {
    for (const candidate of chain) {
      let attempt: Attempt;
      try {
        attempt = await runOnce(
          apiKey,
          candidate,
          messages,
          { temperature, maxTokens, json },
          controller.signal
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new GroqError("The AI took too long to respond. Please try again.", 504);
        }
        throw new GroqError(
          `Could not reach the AI provider: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (attempt.ok && attempt.content) {
        if (warnBase && warnBase !== candidate) {
          console.warn(
            `[groq] "${warnBase}" unavailable — served by "${candidate}".`
          );
        }
        return attempt.content;
      }

      const status = attempt.status ?? 502;
      const body = attempt.body ?? "";
      attempted.push(candidate);
      lastFailure.current = { status, body, model: candidate };

      // Only an unusable model id justifies moving on. An auth, rate-limit or
      // transport failure will not be fixed by switching models.
      if (candidate === chain[chain.length - 1]) break;
      if (!isModelUnavailable(status, body)) return null;
    }
    return null;
  };

  try {
    let content = await walkChain(candidates, explicitModel ? undefined : candidates[0]);

    // The static chain is exhausted and every id was rejected as unavailable.
    // Ask Groq what this key can actually reach and retry against that: this is
    // what stops the app from ever being pinned to a retired or over-restricted
    // id, whatever the registry happens to say today.
    if (
      content === null &&
      !explicitModel &&
      lastFailure.current !== null &&
      isModelUnavailable(lastFailure.current.status, lastFailure.current.body)
    ) {
      const discovered = chatCandidatesFrom(await listAvailableModels(apiKey), family)
        .filter((id) => !attempted.includes(id));
      if (discovered.length > 0) {
        console.warn(
          `[groq] every configured ${family} model was unavailable — asking the API what this key can reach.`
        );
        content = await walkChain(discovered, candidates[0]);
      }
    }

    if (content !== null) return content;

    // Report what the chain actually walked through, so an exhausted chain is
    // named as such instead of blaming whichever model happened to be last.
    const failure = lastFailure.current ?? { status: 502, body: "", model: candidates[0] };

    const message = describeGroqFailure(
      failure.status,
      failure.body,
      failure.model,
      attempted
    );
    if (attempted.length > 1) {
      console.error(
        `[groq] No model in the ${family} chain answered. Tried: ${attempted.join(
          ", "
        )}. Last status: ${failure.status}.`
      );
    }

    throw new GroqError(
      message,
      failure.status >= 400 && failure.status < 600 ? failure.status : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}


/**
 * Parse a JSON answer from an LLM defensively — models occasionally wrap JSON
 * in prose or ```json fences even when asked for raw JSON.
 */
export function parseModelJson<T>(raw: string): T | null {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);
  if (start >= 0) {
    const opening = trimmed[start];
    const closing = opening === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(closing);
    if (end > start) candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
