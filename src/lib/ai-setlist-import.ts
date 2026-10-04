/**
 * Setlist import helpers (v1.43.0).
 *
 * Pure logic behind `POST /api/setlists/parse`: working out whether the user
 * pasted a URL or a setlist, turning a fetched HTML page into something a
 * language model can read, and normalising whatever the model returns into a
 * predictable shape.
 *
 * Deliberately no I/O here. The route owns fetching — and owns the SSRF checks,
 * which need to sit next to the `fetch` call so they cannot be forgotten.
 *
 * This module *extends* the existing photo-OCR pipeline rather than replacing
 * it: the prompts and the library matching already live in the route, and a
 * second extractor alongside it would mean two sources of truth for the same
 * feature.
 */

/** The canonical shape the API returns for a reviewable import. */
export interface ImportedSong {
  title: string;
  key: string | null;
  bpm: number | null;
  tuning: string | null;
  duration: string | null;
  notes: string | null;
  /** Set for "BINDTEKST", "PAUZE", encore and other stage cues. */
  kind: "song" | "special";
  /** The untouched source line, so the user can verify what was read. */
  raw: string | null;
}

export interface ImportedSetlist {
  title: string | null;
  songs: ImportedSong[];
}

/** Longest source text worth sending to the model. */
export const MAX_TEXT_CHARS = 20_000;

/**
 * True when the input looks like a URL rather than pasted setlist text.
 *
 * Deliberately conservative: a setlist line like "1. Enter Sandman" must never
 * be mistaken for a URL, so a scheme is required rather than guessed.
 */
export function isProbablyUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

/** Strips surrounding whitespace and anything after a hash fragment. */
export function normaliseUrl(input: string): string {
  return input.trim().split("#")[0];
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Expands any IPv6 literal to its eight-group hex form.
 *
 * `new URL()` normalises literals, so `[::ffff:127.0.0.1]` arrives as
 * `[::ffff:7f00:1]`. A check that only understands the dotted form is therefore
 * trivially bypassed by writing the IPv4-mapped address in IPv6 notation — which
 * is the same host, and the whole point of the guard is to stop that.
 */
function expandIPv6(host: string): number[] | null {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return null;

  const [head, tail] = h.includes("::")
    ? [h.slice(0, h.indexOf("::")), h.slice(h.indexOf("::") + 2)]
    : [h, null];

  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  if (headGroups.some((g) => g === "" || !/^[0-9a-f]{1,4}$/.test(g))) return null;
  if (tailGroups.some((g) => g === "" || !/^[0-9a-f]{1,4}$/.test(g))) return null;

  const fill = 8 - headGroups.length - tailGroups.length;
  if (tail === null ? fill !== 0 : fill < 0) return null;

  const groups = [
    ...headGroups,
    ...(tail === null ? [] : new Array<string>(fill).fill("0")),
    ...tailGroups,
  ].map((g) => parseInt(g, 16));

  return groups.length === 8 ? groups : null;
}

function isPrivateIPv6(host: string): boolean {
  const groups = expandIPv6(host);
  if (!groups) return false;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms inherit IPv4 rules,
  // which is how "::ffff:127.0.0.1" reaches loopback.
  const isMapped =
    groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0);
  if (isMapped) {
    const [a, b, c, d] = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  const isUnspecified = groups.every((g) => g === 0); // ::
  const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1; // ::1
  // fe80::/10 link-local, fc00::/7 unique-local.
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;

  return isUnspecified || isLoopback || isLinkLocal || isUniqueLocal;
}

/**
 * Rejects URLs that would make the server fetch something it must not.
 *
 * The server fetches whatever URL the user pastes, which turns this endpoint
 * into an SSRF primitive: without this, anyone could ask the server to read
 * `http://169.254.169.254/latest/meta-data/` and be handed cloud credentials,
 * or probe hosts inside the network the app runs in.
 *
 * Only http(s), and only public destinations.
 */
export function assertPublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(normaliseUrl(input));
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be imported.");
  }

  const host = url.hostname;
  const isPrivate =
    isPrivateIPv4(host) ||
    isPrivateIPv6(host) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local");
  if (isPrivate) {
    throw new Error("That address is not a public website.");
  }

  return url;
}

const BLOCKED_TAGS = /<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Flattens an HTML page into readable text.
 *
 * Setlist.fm and friends bury the song list in markup that a model would waste
 * tokens (and attention) on, so tags go first and the visible text second.
 * `<br>` and block-level ends become newlines because that is where the line
 * breaks a setlist depends on.
 */
export function htmlToText(html: string): string {
  return html
    .replace(BLOCKED_TAGS, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    // Tidy what tag-stripping left behind: a space hugging a line break comes from
    // the tag that became a space, and it would reach the model as "1. Alpha\n 2. Beta"
    // — harmless-looking noise on every single line of a real setlist.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cleans a scraped page to something worth sending to a model. */
export function cleanScrapedText(html: string): string {
  const text = htmlToText(html);
  if (!text) throw new Error("That page had no readable text on it.");
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Trims and collapses a model-supplied string, or null when empty. */
function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Numeric tempo, or null. Refuses junk so the UI never shows "NaN bpm". */
export function coerceBpm(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 && value < 400 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  const match = value.match(/\d{1,3}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return parsed > 0 && parsed < 400 ? parsed : null;
}

/** Set-break cues the parser reports as items rather than songs. */
const SPECIAL_PATTERN =
  /^(bindtekst|pause|pauze|intermissie|tweede\s+set|set\s*2|encore|toegift|set\s+time|openen|start|dj[- ]?set|rust|break)\b/i;

export function isSpecialCue(title: string): boolean {
  return SPECIAL_PATTERN.test(title.trim());
}

/**
 * Normalises whatever the model returned into `ImportedSetlist`.
 *
 * Models are inconsistent about optional fields — `bpm` arrives as a number, a
 * string with "bpm" in it, or a key signature guessed from the title. This is
 * where that gets flattened, so the UI has exactly one shape to render.
 *
 * Items without a usable title are dropped rather than shown as blank rows.
 */
export function normaliseImportedSetlist(parsed: unknown): ImportedSetlist {
  const source = (parsed ?? {}) as {
    title?: unknown;
    items?: unknown;
    songs?: unknown;
  };
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.songs)
      ? source.songs
      : [];

  const songs: ImportedSong[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;

    const title = optionalText(item.title) ?? optionalText(item.name) ?? "";
    if (!title) continue;

    const declaredKind = typeof item.kind === "string" ? item.kind.toLowerCase() : "";
    songs.push({
      title,
      key: optionalText(item.key ?? item.keySignature),
      bpm: coerceBpm(item.bpm ?? item.tempo),
      tuning: optionalText(item.tuning),
      duration: optionalText(item.duration),
      notes: optionalText(item.notes ?? item.comment),
      kind: declaredKind === "special" || isSpecialCue(title) ? "special" : "song",
      raw: optionalText(item.raw) ?? optionalText(item.line),
    });
  }

  return { title: optionalText(source.title), songs };
}
