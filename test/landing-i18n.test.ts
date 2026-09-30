import { describe, it, expect } from "vitest";
import {
  DEFAULT_LANDING_LANGUAGE,
  LANDING_LANGUAGES,
  LANDING_TRANSLATIONS,
  isLandingLanguage,
  type LandingCopy,
} from "@/lib/landing-i18n";

type CopyNode = string | readonly CopyNode[] | { readonly [key: string]: CopyNode };

function collectStrings(node: CopyNode, prefix = ""): Record<string, string> {
  if (typeof node === "string") return { [prefix]: node };
  if (Array.isArray(node)) {
    return node.reduce<Record<string, string>>((acc, item, index) => {
      Object.assign(acc, collectStrings(item as CopyNode, `${prefix}[${index}]`));
      return acc;
    }, {});
  }
  return Object.entries(node).reduce<Record<string, string>>((acc, [key, value]) => {
    Object.assign(acc, collectStrings(value, prefix ? `${prefix}.${key}` : key));
    return acc;
  }, {});
}

describe("landing i18n", () => {
  it("defaults to English and exposes the three supported languages", () => {
    expect(DEFAULT_LANDING_LANGUAGE).toBe("en");
    expect(LANDING_LANGUAGES.map((item) => item.code)).toEqual(["en", "nl", "fr"]);
    expect(LANDING_LANGUAGES.map((item) => item.short)).toEqual(["EN", "NL", "FR"]);
    expect(LANDING_LANGUAGES.map((item) => item.label)).toEqual([
      "English",
      "Nederlands",
      "Français",
    ]);
  });

  it("only accepts supported language codes", () => {
    expect(isLandingLanguage("en")).toBe(true);
    expect(isLandingLanguage("nl")).toBe(true);
    expect(isLandingLanguage("fr")).toBe(true);
    expect(isLandingLanguage("de")).toBe(false);
    expect(isLandingLanguage(undefined)).toBe(false);
    expect(isLandingLanguage(null)).toBe(false);
  });

  it("translates every string in all three languages", () => {
    const english = collectStrings(LANDING_TRANSLATIONS.en as unknown as CopyNode);

    for (const language of ["nl", "fr"] as const) {
      const translated = collectStrings(LANDING_TRANSLATIONS[language] as unknown as CopyNode);

      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());

      const missing = Object.entries(english)
        .filter(([key, value]) => !translated[key]?.trim())
        .map(([key]) => key);
      expect(missing).toEqual([]);
    }
  });

  it("keeps the English copy as the untouched source of truth", () => {
    const copy = LANDING_TRANSLATIONS.en as LandingCopy;
    expect(copy.hero.titleLead).toBe("Manage your gigs,");
    expect(copy.hero.titleAccent).toBe("not spreadsheets");
    expect(copy.nav.logIn).toBe("Log In");
    expect(copy.pricing.perMonth).toBe("/month");
    expect(copy.features.items).toHaveLength(6);
  });
});