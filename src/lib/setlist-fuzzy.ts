/**
 * Fuzzy title matching for setlist imports.
 *
 * Deliberately dependency-free and deterministic: setlist titles are short,
 * noisy strings ("Don't Stop Me Now (Live)", "BINDTEKST", "Mr. Blue Sky - 2"),
 * so a normalised Levenshtein ratio plus a token-overlap bonus matches far more
 * reliably than an embedding lookup would — and runs without a network call.
 */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’“”]/g, "'")
    // Drop bracketed suffixes such as "(live)", "(Zinnia)", "(Julot)" — these
    // are per-gig annotations, never part of the song identity.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[[\]{}]/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classic Levenshtein distance, capped for speed on long strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > 100) return 100;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[b.length];
}

/** Similarity in the range 0..1 (1 = identical). */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const distance = levenshtein(left, right);
  const ratio = 1 - distance / Math.max(left.length, right.length);

  // Token overlap rescues reordered/extra-word cases ("Slow Dancing In The
  // Fire" vs "Slow Dancing In The Fire (Live)") that raw distance punishes.
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  const tokenScore =
    rightTokens.size > 0 ? shared / Math.max(leftTokens.size, rightTokens.size) : 0;

  // One side fully contained in the other is a strong signal.
  const containment =
    left.includes(right) || right.includes(left)
      ? Math.min(left.length, right.length) / Math.max(left.length, right.length)
      : 0;

  return Math.max(ratio, tokenScore, containment * 0.95);
}

export type FuzzyMatch<T> = {
  item: T;
  score: number;
};

/** Best match for `candidate` within `candidates`, or null below `threshold`. */
export function findBestMatch<T>(
  candidate: string,
  candidates: Array<{ title: string; item: T }>,
  threshold = 0.8
): FuzzyMatch<T> | null {
  let best: FuzzyMatch<T> | null = null;

  for (const entry of candidates) {
    const score = titleSimilarity(candidate, entry.title);
    // Strictly greater keeps the first entry on ties (stable, predictable).
    if (!best || score > best.score) {
      best = { item: entry.item, score };
    }
  }

  return best && best.score >= threshold ? best : null;
}