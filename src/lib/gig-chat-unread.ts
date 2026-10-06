"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * v1.47.0 — shared unread-count store for the gig chat badges.
 *
 * Dozens of GigCards can be on screen at once; without this, every card would
 * poll its own endpoint. Instead each card subscribes its gig id here and the
 * store issues ONE batched request (`/api/gigs/chat-unread?ids=...`) right
 * after the first subscriber arrives and then every 30 seconds, notifying only
 * the cards whose count actually changed.
 *
 * v1.48.0: Polling is already optimized with visibility-based checks and
 * debouncing; no further changes needed.
 */

type Listener = () => void;
type TokenGetter = () => Promise<string | null>;

const POLL_MS = 30_000;
/** Debounce/throttle so mount storms and resubscribes cannot spam the API. */
const MIN_REFRESH_GAP_MS = 2_000;

const counts = new Map<string, number>();
const listeners = new Map<string, Set<Listener>>();

let tokenSource: TokenGetter | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let lastRefreshAt = 0;

function emit(gigId: string) {
  const set = listeners.get(gigId);
  if (!set) return;
  for (const listener of set) listener();
}

/** Set a count locally (e.g. the modal just marked the chat read). */
export function setGigChatUnread(gigId: string, count: number) {
  if (counts.get(gigId) === count) return;
  counts.set(gigId, count);
  emit(gigId);
}

export function getGigChatUnread(gigId: string): number {
  return counts.get(gigId) ?? 0;
}

async function refreshNow() {
  if (inFlight || listeners.size === 0 || !tokenSource) return;
  const ids = [...listeners.keys()];
  if (ids.length === 0) return;

  inFlight = true;
  try {
    const token = await tokenSource();
    if (!token) return;
    const res = await fetch(
      `/api/gigs/chat-unread?ids=${encodeURIComponent(ids.join(","))}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    lastRefreshAt = Date.now();
    for (const gigId of ids) {
      const next = Math.max(0, Number(data?.counts?.[gigId] ?? 0));
      if (counts.get(gigId) !== next) {
        counts.set(gigId, next);
        emit(gigId);
      }
    }
  } catch {
    // Offline or a transient failure: keep the last known counts; the next
    // poll tick retries.
  } finally {
    inFlight = false;
  }
}

function scheduleRefresh(immediate = false) {
  if (typeof window === "undefined") return;
  const wait = immediate
    ? 0
    : Math.max(0, MIN_REFRESH_GAP_MS - (Date.now() - lastRefreshAt));
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshNow();
  }, wait);
}

/**
 * Register a listener for one gig's unread count. Returns the unsubscribe.
 * The token getter is only used for the shared batched fetch — the most
 * recently registered one wins (all cards belong to the same session).
 */
export function subscribeGigChatUnread(
  gigId: string,
  getAccessToken: TokenGetter,
  listener: Listener
): () => void {
  tokenSource = getAccessToken;

  let set = listeners.get(gigId);
  const firstForGig = !set;
  if (!set) {
    set = new Set();
    listeners.set(gigId, set);
  }
  set.add(listener);

  if (firstForGig) scheduleRefresh();

  if (!pollTimer && typeof window !== "undefined") {
    pollTimer = setInterval(() => {
      // No point polling in a background tab; the next visible tick catches up.
      if (document.visibilityState === "visible") void refreshNow();
    }, POLL_MS);
  }

  return () => {
    const current = listeners.get(gigId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(gigId);
      // Keep the last count so a remount does not flash an empty badge.
    }
    if (listeners.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

/** React binding: re-renders the card when its gig's count changes. */
export function useGigChatUnread(
  gigId: string,
  getAccessToken: TokenGetter
): number {
  const subscribe = useCallback(
    (listener: Listener) =>
      subscribeGigChatUnread(gigId, getAccessToken, listener),
    [gigId, getAccessToken]
  );
  const getSnapshot = useCallback(() => getGigChatUnread(gigId), [gigId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
