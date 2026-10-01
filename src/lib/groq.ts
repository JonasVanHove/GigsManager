/**
 * Minimal Groq (groq.com) client for server-side use.
 *
 * Kept dependency-free on purpose: Groq exposes an OpenAI-compatible
 * `/openai/v1/chat/completions` endpoint, so a plain `fetch` is enough and we
 * avoid pulling another SDK into the bundle.
 *
 * Required env var: GROQ_API_KEY
 */

export const GROQ_MODELS = {
  /** Fast, multimodal — used for OCR of setlist photos. */
  vision: "llama-3.2-11b-vision-preview",
  /** Strong text reasoning — used for gig summaries and setlist parsing. */
  text: "llama-3.3-70b-versatile",
} as const;

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
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the model to answer with a JSON object (response_format). */
  json?: boolean;
  signal?: AbortSignal;
};

/**
 * Call Groq chat completions and return the assistant message content.
 * Throws a GroqError with a 4xx/5xx status so routes can forward it.
 */
export async function callGroq(
  messages: GroqMessage[],
  options: GroqCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "Groq is not configured. Set GROQ_API_KEY to enable AI features.",
      503
    );
  }

  const {
    model = GROQ_MODELS.text,
    temperature = 0.2,
    maxTokens = 1500,
    json = false,
    signal,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
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
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new GroqError(
        `Groq request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
        response.status
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new GroqError("Groq returned an empty response", 502);
    }

    return content.trim();
  } catch (error) {
    if (error instanceof GroqError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GroqError("Groq request timed out", 504);
    }
    throw new GroqError(
      `Could not reach Groq: ${error instanceof Error ? error.message : String(error)}`
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
