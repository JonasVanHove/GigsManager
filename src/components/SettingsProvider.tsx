"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { useRef } from "react";
import type { UserSettingsData } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import {
  CUSTOM_TAB1_STORAGE_KEY,
  CUSTOM_TAB2_STORAGE_KEY,
  buildCustomTabsCookieString,
  isValidTabSlug,
} from "@/lib/custom-tabs";
import { useAuth } from "./AuthProvider";
import { formatDate, formatDateTime, resolveLocale, type AppLanguage } from "@/lib/preferences";

// ── Offline / transient-failure fallback for settings persistence ──────────────
// When PUT /api/settings fails (network down, server 5xx), we keep the user's
// optimistic change locally and remember it in localStorage so a later reload /
// successful login can flush it to the server. This prevents a "503 Service
// Unavailable" failure from silently losing changed settings across reloads.
const PENDING_SETTINGS_STORAGE_KEY = "gig-manager-settings-pending";
const MAX_SAVE_RETRIES = 2; // extra attempts after the first request
const SAVE_RETRY_DELAY_MS = 700;
// Bounded retries for the *initial* settings GET. It is the only DB source
// for customTab1/customTab2 on page load, so a transient 5xx (serverless
// cold start) must not strand the user on default tabs for the whole session.
const SETTINGS_FETCH_RETRIES = 2;
const SETTINGS_FETCH_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPendingSettingsSync(): Partial<UserSettingsData> | null {
  try {
    const raw = window.localStorage.getItem(PENDING_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserSettingsData>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePendingSettingsSync(patch: Partial<UserSettingsData>): void {
  try {
    const existing = readPendingSettingsSync() ?? {};
    window.localStorage.setItem(
      PENDING_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...existing, ...patch })
    );
  } catch {
    // Quota / storage errors are non-fatal: the in-memory optimistic state
    // already reflects the change for the current session.
  }
}

function savePendingSettingsSync(patch: Partial<UserSettingsData>): void {
  try {
    window.localStorage.setItem(PENDING_SETTINGS_STORAGE_KEY, JSON.stringify(patch));
  } catch {
    // ignore storage failures
  }
}

function clearPendingSettingsSync(): void {
  try {
    window.localStorage.removeItem(PENDING_SETTINGS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isTransientSaveError(res: Response | null | undefined, err?: unknown): boolean {
  if (res) return res.status === 429 || res.status >= 500;
  // fetch() throws TypeError on network-level failures (offline, DNS, CORS).
  return err instanceof TypeError;
}

// useLayoutEffect warns during SSR (and never runs there anyway) — this
// isomorphic alias keeps server logs clean while the browser still gets the
// pre-paint layout effect for the localStorage cache adopt.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Cache-first custom tabs: mirror the tab pair into localStorage AND the SSR
 * cookie in one call. Runs on every successful settings fetch and on every UI
 * save, so the next page load renders the right tab names from the first byte
 * (cookie → root layout) with localStorage as the client-side fallback.
 * Only writes the cookie when BOTH halves are valid (never clobbers a good
 * cookie with a half-populated pair).
 */
function persistCustomTabsToCache(
  tab1: string | null | undefined,
  tab2: string | null | undefined
): void {
  if (typeof window === "undefined") return;
  try {
    if (isValidTabSlug(tab1)) window.localStorage.setItem(CUSTOM_TAB1_STORAGE_KEY, tab1);
    if (isValidTabSlug(tab2)) window.localStorage.setItem(CUSTOM_TAB2_STORAGE_KEY, tab2);
  } catch {
    // Storage full / private mode — React state already carries the change.
  }
  try {
    const cookie = buildCustomTabsCookieString(tab1, tab2);
    if (cookie) document.cookie = cookie;
  } catch {
    // Cookies blocked — the localStorage fallback still covers client loads.
  }
}

interface SettingsContextType {
  settings: UserSettingsData;
  /** Is the initial settings load still in progress? */
  loading: boolean;
  /** Save new settings to the server; updates optimistically */
  updateSettings: (patch: Partial<UserSettingsData>) => Promise<void>;
  /** Format an amount using the user's chosen currency */
  fmtCurrency: (amount: number) => string;
  /** UI language preference (system / en / nl) */
  language: AppLanguage;
  /** Update the UI language preference */
  setLanguage: (language: AppLanguage) => void;
  /** Resolved locale string used for dates / currency */
  locale: string;
  /** Format a date using the active locale */
  fmtDate: (value: string | null | undefined) => string;
  /** Format a date/time using the active locale */
  fmtDateTime: (value: string | null | undefined) => string;
  /** Whether to exclude current user from band member count */
  excludeSelfFromMemberCount: boolean;
  /** Counter incremented each time settings (incl. customTab1/customTab2) update.
   *  Navigation components watch this to prioritize re-rendering tabs as soon as
   *  the GET /api/settings response lands, via startTransition. */
  navTabVersion: number;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: React.ReactNode;
  /**
   * Custom tabs parsed from the keep-alive cookie by the server root layout.
   * Identical on the server render AND the client's first (hydration) render
   * (serialized in the RSC payload), so the nav markup matches byte-for-byte
   * while still showing the real custom tab names from the first byte —
   * #418/#423-safe by construction (never a direct localStorage read here).
   */
  initialCustomTab1?: string | null;
  initialCustomTab2?: string | null;
}

export function SettingsProvider({ children, initialCustomTab1, initialCustomTab2 }: SettingsProviderProps) {
  const { session, getAccessToken } = useAuth();
  // Deterministic initial state: server and client first render both derive
  // from the same cookie-backed props, so hydration stays clean.
  const [settings, setSettings] = useState<UserSettingsData>(() => ({
    ...DEFAULT_SETTINGS,
    customTab1: initialCustomTab1 ?? DEFAULT_SETTINGS.customTab1,
    customTab2: initialCustomTab2 ?? DEFAULT_SETTINGS.customTab2,
  }));
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<AppLanguage>("system");
  const settingsFetchBlockedRef = useRef(false);
  const blockedSettingsUserIdRef = useRef<string | null>(null);
  const lastSettingsFetchTimeRef = useRef(0); // Minimum 500ms between fetches
  const SETTINGS_FETCH_THROTTLE_MS = 500;
  // Keys the user changed locally while a save is in flight. A slower PUT
  // response is merged *under* these keys so a rapid second toggle can't be
  // rolled back to the first toggle's stale echo (race-safe persistence).
  const pendingPatchRef = useRef<Partial<UserSettingsData>>({});
  // Signals to consumers that customTab1/customTab2 have been populated from
  // the DB (or are still at deterministic defaults). Navigation components
  // watch this counter to prioritize re-rendering tabs as soon as the GET
  // /api/settings response lands, rather than waiting for the full settings
  // object to settle. Incremented on every settings update (including the
  // initial DEFAULT_SETTINGS), so the first render already carries a stable
  // value and later DB-driven updates increment it to trigger a priority
  // navigation re-render via useTransition in Dashboard.
  const navTabVersionRef = useRef(0);
  const [navTabVersion, setNavTabVersion] = useState(0);
  // Latest committed settings — lets updateSettings compute the full tab pair
  // for a synchronous cache write without adding `settings` to its deps.
  const settingsSnapshotRef = useRef(settings);
  // True when the root layout already server-rendered the tabs from the
  // cookie; then the localStorage adopt below must stay away (cookie won).
  const ssrTabsProvidedRef = useRef(initialCustomTab1 != null || initialCustomTab2 != null);

  const locale = resolveLocale(language);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem("gig-manager-language", nextLanguage);
    } catch {
      // ignore storage failures
    }
  }, []);

  // Keep the snapshot fresh for every state update (fetch, cache adopt, …).
  useEffect(() => {
    settingsSnapshotRef.current = settings;
  }, [settings]);

  // Cache-first custom tabs (instant navigation): when the SSR cookie was
  // absent, adopt the localStorage cache in a LAYOUT effect — it runs after
  // hydration but BEFORE the browser paints, so the default tab names are
  // never visibly shown (no layout shift / flash), while server and client
  // still agree on the initial HTML (#418/#423-safe: the first render matches
  // the server; only a post-hydration, pre-paint update follows).
  useIsomorphicLayoutEffect(() => {
    if (ssrTabsProvidedRef.current) return;
    let raw1: string | null = null;
    let raw2: string | null = null;
    try {
      raw1 = window.localStorage.getItem(CUSTOM_TAB1_STORAGE_KEY);
      raw2 = window.localStorage.getItem(CUSTOM_TAB2_STORAGE_KEY);
    } catch {
      return; // Storage unavailable — defaults + background fetch stand.
    }
    const tab1 = isValidTabSlug(raw1) ? raw1 : null;
    const tab2 = isValidTabSlug(raw2) ? raw2 : null;
    if (!tab1 && !tab2) return;
    setSettings((prev) => ({
      ...prev,
      customTab1: tab1 ?? prev.customTab1,
      customTab2: tab2 ?? prev.customTab2,
    }));
    // Promote localStorage → cookie so the NEXT server render is instant too
    // (the cookie was necessarily absent here, so this cannot clobber it).
    persistCustomTabsToCache(
      tab1 ?? DEFAULT_SETTINGS.customTab1,
      tab2 ?? DEFAULT_SETTINGS.customTab2
    );
    navTabVersionRef.current += 1;
    setNavTabVersion(navTabVersionRef.current);
  }, []);

  // -- Fetch on login ------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const currentUserId = session?.user?.id ?? null;

    if (currentUserId !== blockedSettingsUserIdRef.current) {
      settingsFetchBlockedRef.current = false;
      blockedSettingsUserIdRef.current = currentUserId;
    }

    if (settingsFetchBlockedRef.current) {
      return () => { cancelled = true; };
    }

    // Throttle: prevent fetches within 500ms
    const now = Date.now();
    if (now - lastSettingsFetchTimeRef.current < SETTINGS_FETCH_THROTTLE_MS) {
      return () => { cancelled = true; };
    }
    lastSettingsFetchTimeRef.current = now;

    try {
      const storedLanguage = localStorage.getItem("gig-manager-language") as AppLanguage | null;
      if (storedLanguage === "system" || storedLanguage === "en" || storedLanguage === "nl") {
        setLanguageState(storedLanguage);
      }
    } catch {
      // ignore storage failures
    }

    const load = async () => {
      if (!session?.user) {
        // Reset to defaults but keep the last-known custom nav tabs (cookie /
        // localStorage cache) so the navigation never flashes back to the
        // default tab names while logged out.
        setSettings((prev) => ({
          ...DEFAULT_SETTINGS,
          customTab1: prev.customTab1 ?? DEFAULT_SETTINGS.customTab1,
          customTab2: prev.customTab2 ?? DEFAULT_SETTINGS.customTab2,
        }));
        navTabVersionRef.current += 1;
        setNavTabVersion(navTabVersionRef.current);
        setLoading(false);
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setLoading(false);
          return;
        }

        // Bounded retry loop (see SETTINGS_FETCH_RETRIES above): transient
        // 5xx / network errors are retried before degrading to defaults, so
        // the DB payload (custom tabs, theme, PDF prefs) lands on first load.
        let res: Response | null = null;
        let lastFetchErr: unknown = null;
        for (let attempt = 0; attempt <= SETTINGS_FETCH_RETRIES; attempt += 1) {
          if (attempt > 0) await sleep(SETTINGS_FETCH_RETRY_DELAY_MS * attempt);
          if (cancelled) return;
          try {
            res = await fetch("/api/settings", {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
            if (res.ok || res.status < 500) break;
          } catch (fetchErr) {
            lastFetchErr = fetchErr;
            res = null;
          }
        }

        if (res && res.ok && !cancelled) {
          const data: UserSettingsData = await res.json();
          // Re-apply any settings that failed to push earlier (offline / 5xx),
          // so a reload never silently reverts the user's last edits.
          const pending = readPendingSettingsSync();

          // Prioritize custom tab navigation hydration: update the navigation-
          // critical fields (customTab1, customTab2) immediately so the header
          // re-renders with the DB-provided tab titles as soon as the GET
          // /api/settings response lands, before the remaining settings settle.
          // This avoids a visible flash from default tabs → custom tabs on load.
          const freshTab1 = pending?.customTab1 ?? data.customTab1 ?? DEFAULT_SETTINGS.customTab1;
          const freshTab2 = pending?.customTab2 ?? data.customTab2 ?? DEFAULT_SETTINGS.customTab2;
          setSettings(prev => ({
            ...prev,
            customTab1: freshTab1,
            customTab2: freshTab2,
          }));
          // Background-sync cache update: overwrite localStorage + the SSR
          // cookie with the fresh DB values so subsequent visits/reloads load
          // the updated tabs instantly (before the next fetch even starts).
          persistCustomTabsToCache(freshTab1, freshTab2);
          settingsSnapshotRef.current = {
            ...settingsSnapshotRef.current,
            customTab1: freshTab1,
            customTab2: freshTab2,
          };
          navTabVersionRef.current += 1;
          setNavTabVersion(navTabVersionRef.current);

          // Now merge the full settings payload so the remaining fields
          // (currency, theme, PDF prefs, etc.) settle without blocking the nav.
          setSettings(prev => {
            const merged = { ...prev, ...data, ...pending };
            return merged;
          });

          if (pending && token) {
            // Best-effort flush of deferred settings (fire-and-forget). A
            // failure simply leaves the local pending copy for the next flush.
            fetch("/api/settings", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(pending),
            })
              .then((flushRes) => {
                if (flushRes.ok && !cancelled) {
                  clearPendingSettingsSync();
                  for (const k of Object.keys(pending) as (keyof UserSettingsData)[]) {
                    if (pendingPatchRef.current[k] !== undefined) delete pendingPatchRef.current[k];
                  }
                }
              })
              .catch((err) => console.warn("[Settings] Deferred settings flush failed:", err));
          }
        } else if (!res || res.status >= 500) {
          if (lastFetchErr) {
            console.error("Failed to load settings:", lastFetchErr);
          } else if (res) {
            console.error("Failed to load settings: HTTP", res.status);
          }
          // All retries exhausted — block further fetches for this session and
          // fall back to defaults. The pending-sync store is re-applied over
          // the defaults by the success path on the next successful load, so
          // the user's last edits are never visibly lost.
          settingsFetchBlockedRef.current = true;
          if (!cancelled) {
            // Fall back to defaults for everything EXCEPT the custom nav tabs:
            // the last cached values (cookie/localStorage) keep the navigation
            // stable while the API is unreachable (cache-first).
            setSettings((prev) => ({
              ...DEFAULT_SETTINGS,
              customTab1: prev.customTab1 ?? DEFAULT_SETTINGS.customTab1,
              customTab2: prev.customTab2 ?? DEFAULT_SETTINGS.customTab2,
            }));
            navTabVersionRef.current += 1;
            setNavTabVersion(navTabVersionRef.current);
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        settingsFetchBlockedRef.current = true;
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [session?.user, getAccessToken]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale.startsWith("nl") ? "nl" : "en";
  }, [locale]);

  // -- Persist changes -----------------------------------------------------

  const updateSettings = useCallback(
    async (patch: Partial<UserSettingsData>) => {
      // Optimistic update — the UI should never block on the network.
      setSettings((prev) => ({ ...prev, ...patch }));
      // Track in-flight keys so stale PUT echoes can't clobber newer edits.
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };

      // Cache-first: when the patch touches the custom nav tabs, mirror them
      // into localStorage + the SSR cookie SYNCHRONOUSLY — before the network
      // mutation — so even a reload mid-flight (or a failed PUT) renders the
      // user's chosen tabs from the first byte of the next response.
      if (patch.customTab1 !== undefined || patch.customTab2 !== undefined) {
        const mergedTabs = { ...settingsSnapshotRef.current, ...patch };
        persistCustomTabsToCache(mergedTabs.customTab1, mergedTabs.customTab2);
        settingsSnapshotRef.current = mergedTabs;
      }

      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch (err) {
        console.error("[updateSettings] Failed to resolve access token:", err);
        token = null;
      }

      // No session / offline: keep the change locally so it survives reloads and
      // is flushed on the next successful login (see the load effect above).
      if (!token) {
        console.warn("[updateSettings] Not authenticated; deferring settings to local fallback");
        writePendingSettingsSync(patch);
        throw new Error("Not authenticated — change saved locally");
      }

      let lastErr: unknown = null;

      for (let attempt = 0; attempt <= MAX_SAVE_RETRIES; attempt += 1) {
        if (attempt > 0) {
          // Linear backoff between retries.
          await sleep(SAVE_RETRY_DELAY_MS * attempt);
        }

        let res: Response | null = null;
        try {
          res = await fetch("/api/settings", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(patch),
          });

          if (res.ok) {
            // Remove only the keys this PUT just confirmed from the local
            // pending store — never wipe other deferred keys wholesale.
            const remainingPending = readPendingSettingsSync();
            if (remainingPending) {
              for (const k of Object.keys(patch) as (keyof UserSettingsData)[]) {
                if (remainingPending[k] !== undefined) delete remainingPending[k];
              }
              const stillPending = Object.keys(remainingPending).length > 0 ? remainingPending : null;
              if (stillPending) {
                savePendingSettingsSync(stillPending);
              } else {
                clearPendingSettingsSync();
              }
            }
            let saved: UserSettingsData;
            try {
              saved = await res.json();
            } catch {
              // Server confirmed the save (200) but the echo body was unreadable;
              // keep the optimistic state — nothing was lost.
              console.warn("[updateSettings] Save succeeded (200) but response body unreadable");
              return;
            }
            // Merge instead of replace: partial API responses (e.g. an older
            // deploy missing newer keys) must never wipe existing keys, and a
            // racing response is applied *under* newer optimistic edits.
            for (const k of Object.keys(patch) as (keyof UserSettingsData)[]) {
              if (pendingPatchRef.current[k] !== undefined && (saved as Partial<UserSettingsData>)[k] === (patch as Partial<UserSettingsData>)[k]) {
                delete pendingPatchRef.current[k];
              }
            }
            const pending = pendingPatchRef.current;
            setSettings((prev) => ({ ...prev, ...saved, ...pending }));
            return;
          }

          // Surface the server's structured message (e.g. the 400/500 body from
          // /api/settings) instead of a generic "Save failed".
          let serverMsg = "Save failed";
          try {
            const errJson: unknown = await res.clone().json();
            if (errJson && typeof errJson === "object" && "error" in errJson && typeof (errJson as { error: unknown }).error === "string") {
              serverMsg = (errJson as { error: string }).error;
            }
          } catch { /* keep generic message */ }

          lastErr = new Error(`${serverMsg} (status ${res.status})`);

          // Non-transient HTTP errors (validation 400s, 401s, ...) will never
          // succeed on retry — fail immediately.
          if (!isTransientSaveError(res, undefined)) {
            // Revert this key to server truth so the UI doesn't keep a value the
            // server refused to persist.
            try {
              const revertToken = await getAccessToken();
              if (revertToken) {
                const revertRes = await fetch("/api/settings", {
                  cache: "no-store",
                  headers: {
                    Authorization: `Bearer ${revertToken}`,
                    Accept: "application/json",
                  },
                });
                if (revertRes.ok) {
                  const fresh: UserSettingsData = await revertRes.json();
                  const pending = pendingPatchRef.current;
                  setSettings((prev) => ({ ...prev, ...fresh, ...pending }));
                }
              }
            } catch { /* best-effort revert */ }
            throw lastErr;
          }

          // 5xx / 429 response → retry (loop continues).
        } catch (err) {
          // Network-level failure (fetch threw) is retryable; anything else final.
          if (!isTransientSaveError(res, err)) throw err;
          lastErr = err;
        }
      }

      // All retries exhausted (server down / offline): graceful local fallback so
      // the user's change is never lost and is flushed on a later attempt.
      console.error("[updateSettings] Save failed after retries; keeping change locally", lastErr);
      writePendingSettingsSync(patch);
      throw lastErr instanceof Error ? lastErr : new Error("Failed to save settings");
    },
    [getAccessToken]
  );

  // -- Currency helper -----------------------------------------------------

  const fmtCurrency = useCallback(
    (amount: number) => {
      const cur = settings.currency || "EUR";
      return new Intl.NumberFormat(locale, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(amount);
    },
    [settings.currency, locale]
  );

  const fmtDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return "";
      return formatDate(value, locale);
    },
    [locale]
  );

  const fmtDateTime = useCallback(
    (value: string | null | undefined) => {
      if (!value) return "";
      return formatDateTime(value, locale);
    },
    [locale]
  );

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, fmtCurrency, language, setLanguage, locale, fmtDate, fmtDateTime, excludeSelfFromMemberCount: settings.excludeSelfFromMemberCount ?? false, navTabVersion }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
