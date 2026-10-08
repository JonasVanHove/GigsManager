/**
 * Parser for the `[[song-meta]]{json}[[/song-meta]]` block that SongsTab /
 * SetlistsTab serialize into a song record's `notes` field.
 *
 * Lives in src/lib (not in the parse route) because Next.js only allows
 * route-handler exports from `route.ts` files.
 */

export type SongMetaBlock = {
  keySignature: string;
  bpm: string;
  comments: string;
};

export function parseSongMetaFromNotes(
  raw: string | null | undefined
): SongMetaBlock | null {
  if (!raw) return null;
  const start = raw.indexOf("[[song-meta]]");
  const end = raw.indexOf("[[/song-meta]]");
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start + 13, end).trim()) as Partial<
      SongMetaBlock
    >;
    return {
      keySignature:
        typeof parsed.keySignature === "string" ? parsed.keySignature : "",
      bpm: typeof parsed.bpm === "string" ? parsed.bpm : "",
      comments: typeof parsed.comments === "string" ? parsed.comments : "",
    };
  } catch {
    return null;
  }
}
