"use client";

/**
 * Offline-aware data hooks for setlists & songs.
 *
 * Strategy per collection:
 *   1. Try the network fetch (auth header included).
 *   2. On success, automatically write a shadow copy to IndexedDB.
 *   3. On network failure, being offline (`navigator.onLine === false`), or a
 *      5xx/503 gateway response, transparently fall back to the IndexedDB
 *      shadow copy — with zero blocking errors or endless spinners.
 *
 * Auth problems (401/403) are NOT treated as offline: they surface as
 * `data: null, fromCache: false` so the caller can show its normal error.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getPayload, savePayload } from "./db";

export interface OfflineResult<T> {
  /** The collection data, or null when neither network nor cache produced it. */
  data: T | null;
  /** True when the data came from the IndexedDB shadow copy. */
  fromCache: boolean;
}

type TokenGetter = () => Promise<string | null>;

/** Tracks `navigator.onLine` reactively (SSR-safe, defaults to true). */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Network-first fetch with IndexedDB shadow write + fallback for one API
 * collection. The returned `fetchCollection` callback is stable across
 * renders (it reads the token getter through a ref), so it is safe to use
 * inside `useCallback`/`useEffect` dependency arrays without churn.
 */
/** How long to wait for the Supabase session before giving up on the network. */
const TOKEN_WAIT_ATTEMPTS = 4;
const TOKEN_WAIT_INTERVAL_MS = 250;

/**
 * Polls `getAccessToken()` a few times before declaring the session missing.
 *
 * The session is resolved asynchronously, so a single immediate check can
 * return null on a cold load even though a perfectly valid session exists one
 * tick later. Without this, an offline-first collection reports "no data" and
 * the UI shows a spurious load failure.
 */
async function waitForToken(getAccessToken: TokenGetter): Promise<string | null> {
  for (let attempt = 0; attempt < TOKEN_WAIT_ATTEMPTS; attempt += 1) {
    const token = await getAccessToken();
    if (token) return token;
    if (attempt < TOKEN_WAIT_ATTEMPTS - 1) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, TOKEN_WAIT_INTERVAL_MS)
      );
    }
  }
  return null;
}

export function useOfflineCollection<T>(store: string, url: string, getAccessToken: TokenGetter) {
  const tokenRef = useRef(getAccessToken);
  useEffect(() => {
    tokenRef.current = getAccessToken;
  });

  const fetchCollection = useCallback(async (): Promise<OfflineResult<T>> => {
    const token = await tokenRef.current();

    // No token at all: fall straight through to the cached copy (if any) so
    // an expired session during a gig still shows the repertoire.
    if (!token) {
      /*
       * `getAccessToken()` resolves the Supabase session asynchronously. On a
       * cold load (or right after /demo logs someone in) it can still be null
       * for a few hundred ms even though a valid session exists — returning null
       * straight away surfaced as a permanent "failed to load setlists".
       * Wait briefly for the token before falling back to the offline copy.
       */
      const available = await waitForToken(tokenRef.current);
      if (available) {
        return fetchCollection();
      }
      const cached = await getPayload<T>(store);
      return { data: cached, fromCache: cached !== null };
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = (await response.json()) as T;
        // Shadow copy: best-effort, never blocks or breaks the load.
        void savePayload(store, data).catch(() => {});
        return { data, fromCache: false };
      }

      // Gateway/server trouble (5xx) may still mean "no connectivity" —
      // degrade to the cached copy instead of failing the gig view.
      if (response.status >= 500) {
        const cached = await getPayload<T>(store);
        if (cached !== null) return { data: cached, fromCache: true };
      }

      return { data: null, fromCache: false };
    } catch {
      // Network error / offline -> IndexedDB fallback, seamlessly.
      const cached = await getPayload<T>(store);
      return { data: cached, fromCache: cached !== null };
    }
  }, [store, url]);

  const isOffline = useOnlineStatus() === false;
  return { fetchCollection, isOffline };
}

/** Offline-aware `/api/songs?includeAttachments=true` collection. */
export function useOfflineSongs<T = unknown>(getAccessToken: TokenGetter) {
  return useOfflineCollection<T[]>(
    "songs",
    "/api/songs?includeAttachments=true",
    getAccessToken,
  );
}

/** Offline-aware `/api/setlists` collection (includes items + gigs). */
export function useOfflineSetlists<T = unknown>(getAccessToken: TokenGetter) {
  return useOfflineCollection<T[]>(
    "setlists",
    "/api/setlists",
    getAccessToken,
  );
}
