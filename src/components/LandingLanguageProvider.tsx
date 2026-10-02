"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LANDING_LANGUAGE,
  LANDING_TRANSLATIONS,
  LandingLanguageContext,
  detectBrowserLanguage,
  persistLanguage,
  readStoredLanguage,
  type LandingLanguage,
  type LandingLanguageContextValue,
} from "@/lib/landing-i18n";

/**
 * Supplies the active landing-page language and its copy.
 *
 * Starts on the default (English) so the server render and the first client
 * render match exactly, then applies the stored preference after mount — no
 * hydration mismatch, and the visitor's choice is restored immediately.
 */
export function LandingLanguageProvider({
  children,
  detectBrowser = false,
}: {
  children: ReactNode;
  /**
   * When true, a visitor with no stored preference gets the language their
   * browser asks for. The landing page leaves this off so the first paint stays
   * English; the /join screen turns it on because most people arrive there
   * cold from a QR scan.
   */
  detectBrowser?: boolean;
}) {
  const [language, setLanguageState] = useState<LandingLanguage>(DEFAULT_LANDING_LANGUAGE);

  useEffect(() => {
    const stored = readStoredLanguage();
    if (stored) {
      setLanguageState(stored);
      return;
    }
    if (detectBrowser) {
      const detected = detectBrowserLanguage();
      if (detected) setLanguageState(detected);
    }
  }, [detectBrowser]);

  // Keep <html lang> in sync for screen readers and browser translation prompts.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: LandingLanguage) => {
    setLanguageState(next);
    persistLanguage(next);
  }, []);

  const value = useMemo<LandingLanguageContextValue>(
    () => ({ language, copy: LANDING_TRANSLATIONS[language], setLanguage }),
    [language, setLanguage]
  );

  return <LandingLanguageContext.Provider value={value}>{children}</LandingLanguageContext.Provider>;
}

export default LandingLanguageProvider;