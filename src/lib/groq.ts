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
 * Text prefers llama-3.3-70b-versatile (or whatever `GROQ_MODEL_NAME` points at)
 * and falls back through the models below before giving up.
 *
 * v1.39.0 restores the text fallback that v1.34.0 removed. The earlier removal
 * reasoned that a second failing request produced the same user-facing error,
 * and that held while *both* candidates came from one account's key. It stops
 * holding once the primary is `GROQ_MODEL_NAME`: an org-scoped or revoked model
 * id is rejected for everyone on that key while other candidates still serve,
 * so walking the chain turns a hard failure into a working AI feature. The
 * chain is still walked ONLY on `isModelUnavailable` — never on auth, rate
 * limit or transport failures, which a retry cannot fix.
 *
 * `GROQ_MODEL_NAME` is the escape hatch for keys scoped to a different model.
 */
export const GROQ_MODELS = {
  text: ["llama-3.3-70b-versatile"] as const,
  vision: ["llama-3.2-11b-vision-preview"] as const,
  /**
   * Ordered by preference. llama3-70b-8192 is the quality-preserving retry;
   * llama-3.1-8b-instant is the last resort that keeps smaller/scoped keys
   * working at all.
   */
  fallback: {
    text: ["llama3-70b-8192", "llama-3.1-8b-instant"] as const,
    vision: ["llama-3.2-90b-vision-preview"] as const,
  },
} as const;

export type GroqModelFamily = "text" | "vision";

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
    return `Your Groq key does not have access to "${model}", so AI features cannot run. Enable this model for your account at console.groq.com, or set GROQ_MODEL_NAME in the environment to a model your key can reach.`;
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

  try {
    let lastFailure: { status: number; body: string; model: string } | null = null;
    // Models that were actually tried and failed, in order.
    const attempted: string[] = [];

    for (const candidate of candidates) {
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
        if (candidate !== candidates[0]) {
          console.warn(
            `[groq] "${candidates[0]}" unavailable — served by fallback "${candidate}".`
          );
        }
        return attempt.content;
      }

      lastFailure = {
        status: attempt.status ?? 502,
        body: attempt.body ?? "",
        model: candidate,
      };

      // Only a retired model id justifies moving to the next candidate.
      const canRetry =
        lastFailure.model !== candidates[candidates.length - 1] &&
        isModelUnavailable(lastFailure.status, lastFailure.body);
      if (!canRetry) break;
    }

    // Record what the chain actually walked through, so an exhausted chain can be
    // reported as such instead of blaming whichever model happened to be last.
    const failure = lastFailure ?? { status: 502, body: "", model: candidates[0] };
    if (lastFailure) attempted.push(failure.model);

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
