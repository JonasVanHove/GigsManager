"use client";

import { useEffect, useRef } from "react";
import { useSettings } from "./SettingsProvider";

/**
 * ThemeProvider: Applies the user's theme preference to the document
 *
 * - "light": Always light theme
 * - "dark": Always dark theme
 * - "system": Follows device preference (light/dark mode)
 *
 * The actual CSS is handled by Tailwind's dark: prefix
 * Theme is persisted in localStorage for consistency
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  // Remembers the first resolved theme so we only animate real user switches,
  // never the initial (pre-paint) application of the stored preference.
  const appliedTheme = useRef<string | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { theme } = settings;
    const htmlElement = document.documentElement;

    // Persist theme choice in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
    }

    // Animate only when the resolved theme actually changes after boot.
    const resolved = theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;

    if (appliedTheme.current !== null && appliedTheme.current !== resolved) {
      htmlElement.classList.add("theme-anim");
      if (animationTimer.current) clearTimeout(animationTimer.current);
      animationTimer.current = setTimeout(() => {
        htmlElement.classList.remove("theme-anim");
      }, 220);
    }
    appliedTheme.current = resolved;

    if (theme === "dark") {
      // Force dark mode — add dark class
      htmlElement.classList.add("dark");
      // Do NOT set inline body background — the CSS gradient in globals.css handles it
    } else if (theme === "light") {
      // Force light mode — remove dark class
      htmlElement.classList.remove("dark");
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        htmlElement.classList.add("dark");
      } else {
        htmlElement.classList.remove("dark");
      }

      // Listen for system preference changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          htmlElement.classList.add("dark");
        } else {
          htmlElement.classList.remove("dark");
        }
      };

      try {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      } catch {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [settings]);

  return <>{children}</>;
}
