"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRef } from "react";
import type { UserSettingsData } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
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
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { session, getAccessToken } = useAuth();
  const [settings, setSettings] = useState<UserSettingsData>(DEFAULT_SETTINGS);
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

  const locale = resolveLocale(language);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem("gig-manager-language", nextLanguage);
    } catch {
      // ignore storage failures
    }
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
        setSettings(DEFAULT_SETTINGS);
        setLoading(false);
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await fetch("/api/settings", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (res.ok && !cancelled) {
          const data: UserSettingsData = await res.json();
          // Re-apply any settings that failed to push earlier (offline / 5xx),
          // so a reload never silently reverts the user's last edits.
          const pending = readPendingSettingsSync();
          setSettings(pending ? { ...data, ...pending } : data);
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
        } else if (res.status >= 500) {
          settingsFetchBlockedRef.current = true;
          if (!cancelled) {
            setSettings(DEFAULT_SETTINGS);
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
    <SettingsContext.Provider value={{ settings, loading, updateSettings, fmtCurrency, language, setLanguage, locale, fmtDate, fmtDateTime, excludeSelfFromMemberCount: settings.excludeSelfFromMemberCount ?? false }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
