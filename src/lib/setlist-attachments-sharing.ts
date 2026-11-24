/**
 * Setlist Item Attachments Sharing & Privacy Manager.
 * 
 * Rules:
 * - Attachments are user-level.
 * - Private by default ("private").
 * - Can be shared with:
 *   - "band": Everyone in the band.
 *   - "selected": Specific band member/user IDs.
 */

export type AttachmentSharingScope = "private" | "band" | "selected";

export interface AttachmentSharingMeta {
  userId: string;
  userName?: string;
  instrument?: string; // e.g. "Drums", "Gitaar", "Bas"
  scope: AttachmentSharingScope;
  sharedWith: string[]; // member IDs or user IDs if scope === "selected"
  caption?: string;
}

const SHARING_TAG_REGEX = /<!--attachment-sharing:(\{.*?\})-->/;

export function parseAttachmentSharingMeta(description: string | null | undefined): {
  cleanDescription: string;
  meta: AttachmentSharingMeta | null;
} {
  if (!description) {
    return { cleanDescription: "", meta: null };
  }

  const match = description.match(SHARING_TAG_REGEX);
  if (!match || !match[1]) {
    return { cleanDescription: description, meta: null };
  }

  try {
    const meta = JSON.parse(match[1]) as AttachmentSharingMeta;
    const cleanDescription = description.replace(SHARING_TAG_REGEX, "").trim();
    return { cleanDescription, meta };
  } catch {
    return { cleanDescription: description, meta: null };
  }
}

export function serializeAttachmentSharingDescription(
  cleanDescription: string | null | undefined,
  meta: AttachmentSharingMeta
): string {
  const clean = (cleanDescription || "").replace(SHARING_TAG_REGEX, "").trim();
  const tag = `<!--attachment-sharing:${JSON.stringify(meta)}-->`;
  return clean ? `${clean}\n${tag}` : tag;
}

/**
 * Checks if a given viewer can see an attachment based on its sharing metadata.
 * 
 * @param meta The attachment's parsed sharing metadata
 * @param viewer Context containing viewer user ID, user email, and member IDs
 */
export function canViewerAccessAttachment(
  meta: AttachmentSharingMeta | null,
  viewer: {
    userId: string;
    memberIds?: string[];
  }
): boolean {
  // If no meta exists (legacy attachment), allow access
  if (!meta) return true;

  // Uploader always has access to their own attachment
  if (meta.userId === viewer.userId) {
    return true;
  }

  // If private, only uploader can access
  if (meta.scope === "private") {
    return false;
  }

  // If shared with whole band, any band member (the viewer) can access
  if (meta.scope === "band") {
    return true;
  }

  // If shared with selected members, check if viewer's userId or any memberId matches
  if (meta.scope === "selected") {
    if (meta.sharedWith.includes(viewer.userId)) {
      return true;
    }
    if (viewer.memberIds && viewer.memberIds.some((id) => meta.sharedWith.includes(id))) {
      return true;
    }
    return false;
  }

  return false;
}
