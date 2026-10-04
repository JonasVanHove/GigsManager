"use client";

/**
 * Service-worker helpers for Stage Mode (v1.42.0).
 *
 * The strategies in `public/sw.js` already cache gig and setlist payloads as a
 * side effect of fetching them. That is enough for "reload while offline", but
 * not for "walk into a basement venue": nothing guarantees the entry exists,
 * and nothing keeps it from being evicted.
 *
 * So Stage Mode pins its own kit — the gig and its setlist — once it has
 * successfully loaded them, and the worker serves that copy when the network is
 * gone. Everything here is best-effort: a browser without a service worker, a
 * worker that has not taken control yet, or a quota error must never break the
 * stage view, which is the one screen that has to work under pressure.
 */

/** True when a service worker is installed and controlling this page. */
export function isServiceWorkerReady(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    Boolean(navigator.serviceWorker.controller)
  );
}

/** True when the browser currently reports no connectivity. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface StageKitInput {
  /** Gig id, so the gig payload can be pinned alongside the setlist. */
  gigId: string;
  /** The setlist attached to the gig, when it has one. */
  setlistId?: string | null;
  /** Bearer token; the worker fetches on our behalf and needs it. */
  token: string;
}

/**
 * Asks the worker to cache this gig's data for offline stage use.
 *
 * Resolves to the number of entries pinned, or 0 when there is no worker to ask.
 * Never throws — a failure here means "no offline copy", not "no stage".
 */
export function pinStageKit(input: StageKitInput): Promise<number> {
  if (!isServiceWorkerReady() || !input.token) return Promise.resolve(0);

  const urls = [`/api/gigs/${encodeURIComponent(input.gigId)}`];
  if (input.setlistId) {
    urls.push(`/api/setlists/${encodeURIComponent(input.setlistId)}`);
  }

  const controller = navigator.serviceWorker.controller;
  if (!controller) return Promise.resolve(0);

  return new Promise<number>((resolve) => {
    // The worker replies when it is done; do not wait forever if it never does.
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(0);
    }, 10_000);

    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "STAGE_KIT_PINNED") return;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(Number(event.data.pinned) || 0);
    }

    navigator.serviceWorker.addEventListener("message", onMessage);

    try {
      controller.postMessage({
        type: "PIN_STAGE_KIT",
        entries: urls.map((url) => ({ url, token: input.token })),
      });
    } catch (err) {
      console.warn("[pwa] failed to pin stage kit:", err);
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(0);
    }
  });
}
