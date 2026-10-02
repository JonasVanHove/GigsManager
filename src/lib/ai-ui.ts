/**
 * Shared classes for AI output boxes (summaries, parsed results, errors).
 *
 * Why this exists: Groq/API error strings are long, unbroken English sentences
 * with no spaces to break on in places (URLs, model ids, JSON keys). Inside a
 * flex/grid parent that pushes the box wider than the viewport and gives the
 * whole page a horizontal scrollbar on mobile.
 *
 * - `ai-box` constrains the container itself.
 * - `ai-box-text` guarantees any content inside can shrink and wrap, even a
 *   single unbreakable token.
 */

export const AI_BOX =
  "w-full min-w-0 max-w-full overflow-x-hidden break-words";

/** Inner text/markup of an AI box. */
export const AI_BOX_TEXT = "w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere]";

/**
 * For preformatted content (raw API output, code, stack traces): keep the
 * whitespace, but never let it widen the page. `whitespace-pre-wrap` preserves
 * line breaks while `break-words` wraps long lines.
 */
export const AI_BOX_PRE =
  "w-full min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/** Modal/drawer shell that must never exceed the viewport width. */
export const AI_SHEET = "w-full min-w-0 max-w-full overflow-x-hidden";