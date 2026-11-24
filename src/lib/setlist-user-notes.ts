/**
 * User-level notes on Setlist Items.
 * 
 * In a multiplayer band setlist, song notes are often role-specific
 * (drummer cues vs guitar capo/tab vs singer lyrics).
 * 
 * Supports:
 * - Shared general note
 * - User-specific private notes (scoped by userId)
 */

export interface UserNoteEntry {
  note: string;
  updatedAt?: string;
}

export interface SetlistItemNotesData {
  generalNote: string;
  userNotes: { [userId: string]: UserNoteEntry };
}

const USER_NOTES_TAG_REGEX = /<!--user-notes:(\{.*?\})-->/;

export function parseSetlistItemNotes(rawNotes: string | null | undefined): SetlistItemNotesData {
  if (!rawNotes) {
    return { generalNote: "", userNotes: {} };
  }

  const match = rawNotes.match(USER_NOTES_TAG_REGEX);
  if (!match || !match[1]) {
    return { generalNote: rawNotes, userNotes: {} };
  }

  try {
    const userNotes = JSON.parse(match[1]) as { [userId: string]: UserNoteEntry };
    const generalNote = rawNotes.replace(USER_NOTES_TAG_REGEX, "").trim();
    return { generalNote, userNotes };
  } catch {
    return { generalNote: rawNotes, userNotes: {} };
  }
}

export function serializeSetlistItemNotes(
  generalNote: string | null | undefined,
  userNotes: { [userId: string]: UserNoteEntry }
): string {
  const cleanGeneral = (generalNote || "").replace(USER_NOTES_TAG_REGEX, "").trim();
  const hasUserNotes = Object.keys(userNotes).length > 0;
  if (!hasUserNotes) return cleanGeneral;

  const tag = `<!--user-notes:${JSON.stringify(userNotes)}-->`;
  return cleanGeneral ? `${cleanGeneral}\n\n${tag}` : tag;
}

export function getUserNoteForViewer(
  rawNotes: string | null | undefined,
  userId?: string | null
): {
  generalNote: string;
  userNote: string;
} {
  const parsed = parseSetlistItemNotes(rawNotes);
  const userNote = (userId && parsed.userNotes[userId]?.note) || "";
  return {
    generalNote: parsed.generalNote,
    userNote,
  };
}

export function setUserNoteForViewer(
  rawNotes: string | null | undefined,
  userId: string,
  newUserNote: string
): string {
  const parsed = parseSetlistItemNotes(rawNotes);
  const updatedUserNotes = { ...parsed.userNotes };

  if (newUserNote.trim()) {
    updatedUserNotes[userId] = {
      note: newUserNote.trim(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete updatedUserNotes[userId];
  }

  return serializeSetlistItemNotes(parsed.generalNote, updatedUserNotes);
}
