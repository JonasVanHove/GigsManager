"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRef } from "react";
import type { UserSettingsData } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { useAuth } from "./AuthProvider";
import { formatDate, formatDateTime, resolveLocale, type AppLanguage } from "@/lib/preferences";

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
          setSettings(data);
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
      // Optimistic update
      setSettings((prev) => ({ ...prev, ...patch }));

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");

        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });

        if (!res.ok) throw new Error("Save failed");

        const saved: UserSettingsData = await res.json();
        // Merge instead of replace: partial API responses (e.g. an older
        // deploy missing newer keys) must never wipe existing keys, and a
        // racing response must not discard the optimistic local update.
        setSettings((prev) => ({ ...prev, ...saved }));
      } catch (err) {
        console.error("Failed to save settings:", err);
        // Revert — re-fetch from server
        try {
          const token = await getAccessToken();
          if (token) {
            const res = await fetch("/api/settings", {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
            if (res.ok) { const fresh: UserSettingsData = await res.json(); setSettings((prev) => ({ ...prev, ...fresh })); }
          }
        } catch { /* silent */ }
        throw err; // propagate so caller can show a toast
      }
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
