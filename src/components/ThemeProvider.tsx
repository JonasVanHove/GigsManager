"use client";

import { useEffect } from "react";
import { useSettings } from "./SettingsProvider";

/**
 * ThemeProvider: Applies the user's theme preference to the document
 *
 * - "light": Always light theme
 * - "dark": Always dark theme
 * - "system": Follows device preference (light/dark mode)
 *
 * The actual CSS is handled by Tailwind's dark: prefix
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    const { theme } = settings;
    const htmlElement = document.documentElement;

    if (theme === "dark") {
      // Force dark mode
      htmlElement.classList.add("dark");
    } else if (theme === "light") {
      // Force light mode
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

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [settings.theme]);

  return <>{children}</>;
}
