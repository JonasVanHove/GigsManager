"use client";

import { useEffect, useState } from "react";
import { AuthProvider } from "./AuthProvider";
import { SettingsProvider } from "./SettingsProvider";
import { ThemeProvider } from "./ThemeProvider";
import { I18nProvider } from "./I18nProvider";

export function ClientLayout({
  children,
  initialCustomTab1,
  initialCustomTab2,
}: {
  children: React.ReactNode;
  /** Custom tabs parsed from the SSR cookie by the server root layout. */
  initialCustomTab1?: string | null;
  initialCustomTab2?: string | null;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Use requestAnimationFrame to ensure immediate rendering on mobile pull-to-refresh
    // This prevents blank screen by pushing mount state to next animation frame
    requestAnimationFrame(() => {
      setIsMounted(true);
    });
    // Hydration guard marker: the inline watchdog in app/layout.tsx checks this
    // attribute after a grace period. If React never hydrated (e.g. a stale or
    // SW-cached chunk after a hard refresh), the watchdog performs a single
    // cache-busting reload instead of leaving the user on "Loading
    // application..." forever.
    try {
      document.documentElement.setAttribute("data-app-mounted", "1");
      sessionStorage.removeItem("__gigs_hydration_reload");
    } catch {
      // Storage access can throw in private browsing - the watchdog still works
    }
  }, []);

  // Always render children - don't block on mounting state
  // The providers will handle their own loading states internally
  return (
    <AuthProvider>
      <SettingsProvider
        initialCustomTab1={initialCustomTab1}
        initialCustomTab2={initialCustomTab2}
      >
        <I18nProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </I18nProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
