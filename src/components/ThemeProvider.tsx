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
 * Theme is persisted in localStorage for consistency
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    const { theme } = settings;
    const htmlElement = document.documentElement;

    // Persist theme choice in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
    }

    if (theme === "dark") {
      // Force dark mode — add dark class
      htmlElement.classList.add("dark");
      document.body.style.backgroundColor = "#0a0a0f";
    } else if (theme === "light") {
      // Force light mode — remove dark class
      htmlElement.classList.remove("dark");
      document.body.style.backgroundColor = "#f8fafc";
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        htmlElement.classList.add("dark");
        document.body.style.backgroundColor = "#0a0a0f";
      } else {
        htmlElement.classList.remove("dark");
        document.body.style.backgroundColor = "#f8fafc";
      }

      // Listen for system preference changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          htmlElement.classList.add("dark");
          document.body.style.backgroundColor = "#0a0a0f";
        } else {
          htmlElement.classList.remove("dark");
          document.body.style.backgroundColor = "#f8fafc";
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
  }, [settings.theme]);

  return <>{children}</>;
}
