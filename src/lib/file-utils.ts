/**
 * Shared client-side file helpers.
 *
 * The same FileReader-to-data-URL snippet was duplicated across the setlist
 * import modal, the gig attachments panel, the song media manager and the
 * band logo fallback. One copy keeps the error wording consistent (callers
 * surface read failures to the user) and keeps `.tsx` components focused on
 * UI rather than FileReader boilerplate.
 */

/** Reads a File/Blob as a base64 data URL. Rejects when the read fails. */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Failed to read file"));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
