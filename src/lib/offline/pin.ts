"use client";

/**
 * "Offline Opslaan" (Pin for Offline) — explicit full-hydration pass for one
 * setlist: writes the setlist (metadata, order, item notes, key changes), all
 * its songs (title, notes/lyrics, chord charts, attachments) and the item
 * attachments into IndexedDB, and registers attachment image URLs with the
 * service worker so they are also available in the HTTP cache while offline.
 */

import {
  deletePinnedSetlist,
  getPinnedSetlistIds,
  getPinnedSetlists,
  savePinnedSetlist,
  type PinnedSetlistRecord,
} from "./db";

interface PinInput {
  /** Raw /api/setlists payload entry for the setlist being pinned. */
  setlist: unknown;
  /** Attachment lists keyed by setlist-item id (itemAttachments state map). */
  itemAttachments: Record<string, unknown[]>;
  /** Raw /api/songs payload snapshot (lyrics + attachments included). */
  songs: unknown[];
}

function collectAttachmentUrls(input: PinInput): { urls: string[]; audioCount: number } {
  const urls = new Set<string>();
  // Audio files (mp3/wav/m4a/ogg/flac backing tracks & rehearsal demos) must
  // always be precached — the <audio> player replays them from the SW cache
  // (gigs-manager-offline-v1) while offline.
  const AUDIO_PATTERN = /\.(mp3|wav|m4a|ogg|oga|flac|aac|webm)(?:[?#]|$)/i;
  let audioCount = 0;
  const pushFrom = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const att = entry as { publicUrl?: unknown; url?: unknown; contentType?: unknown };
      // Attachments arrive in two shapes: song attachments carry `publicUrl`
      // (Supabase storage list) while setlist-item attachments carry `url`
      // (uploaded via loadItemAttachments). Both must be collected or pinned
      // audio/chord charts silently miss the cache.
      const url = typeof att.publicUrl === "string" ? att.publicUrl : typeof att.url === "string" ? att.url : null;
      if (!url || !url.startsWith("http")) continue;
      const isAudio =
        (typeof att.contentType === "string" && att.contentType.startsWith("audio/")) ||
        AUDIO_PATTERN.test(url);
      if (isAudio) audioCount++;
      urls.add(url);
    }
  };

  pushFrom(input.songs);
  Object.values(input.itemAttachments || {}).forEach(pushFrom);
  return { urls: Array.from(urls), audioCount };
}

/** Asks the service worker to precache the given URLs (best-effort). */
function cacheUrlsInServiceWorker(urls: string[]): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller || urls.length === 0) {
    return;
  }
  try {
    navigator.serviceWorker.controller.postMessage({ type: "PIN_URLS", urls });
  } catch (err) {
    console.warn("[offline/pin] failed to message service worker:", err);
  }
}

/**
 * Pins a setlist for offline use and returns the number of attachment URLs
 * handed to the service worker cache. Never throws.
 */
export async function pinSetlistForOffline(input: PinInput & { id: string }): Promise<number> {
  const record: PinnedSetlistRecord = {
    id: input.id,
    pinnedAt: new Date().toISOString(),
    setlist: input.setlist,
    itemAttachments: input.itemAttachments || {},
    songs: Array.isArray(input.songs) ? input.songs : [],
  };

  const saved = await savePinnedSetlist(record);
  if (!saved) {
    console.warn("[offline/pin] could not persist pinned setlist to IndexedDB");
  }

  const { urls, audioCount } = collectAttachmentUrls(input);
  cacheUrlsInServiceWorker(urls);
  if (audioCount > 0) {
    console.info(`[offline/pin] pinned ${urls.length} attachments incl. ${audioCount} audio file(s)`);
  }
  return urls.length;
}

export async function unpinSetlistFromOffline(id: string): Promise<void> {
  await deletePinnedSetlist(id);
}

export async function isSetlistPinned(id: string): Promise<boolean> {
  const ids = await getPinnedSetlistIds();
  return ids.has(id);
}

export { getPinnedSetlistIds, getPinnedSetlists };
