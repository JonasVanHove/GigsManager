"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { UserSettingsData } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { useAuth } from "./AuthProvider";

interface SettingsContextType {
  settings: UserSettingsData;
  /** Is the initial settings load still in progress? */
  loading: boolean;
  /** Save new settings to the server; updates optimistically */
  updateSettings: (patch: Partial<UserSettingsData>) => Promise<void>;
  /** Format an amount using the user's chosen currency */
  fmtCurrency: (amount: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { session, getAccessToken } = useAuth();
  const [settings, setSettings] = useState<UserSettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // -- Fetch on login ------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

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
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok && !cancelled) {
          const data: UserSettingsData = await res.json();
          setSettings(data);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [session?.user, getAccessToken]);

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
        setSettings(saved);
      } catch (err) {
        console.error("Failed to save settings:", err);
        // Revert — re-fetch from server
        try {
          const token = await getAccessToken();
          if (token) {
            const res = await fetch("/api/settings", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setSettings(await res.json());
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
      const locale =
        cur === "USD" ? "en-US" : cur === "GBP" ? "en-GB" : cur === "EUR" ? "nl-BE" : "en-US";
      return new Intl.NumberFormat(locale, { style: "currency", currency: cur }).format(amount);
    },
    [settings.currency]
  );

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, fmtCurrency }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
