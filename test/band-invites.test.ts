import { describe, it, expect, afterEach } from "vitest";
import { generateInviteCode, normalizeEmail } from "@/lib/band-invites";
import { detectBrowserLanguage } from "@/lib/landing-i18n";

/**
 * /join is usually reached cold from a QR scan, so with no stored preference it
 * falls back to the browser's language. Regional tags must collapse to their
 * base language, otherwise a Belgian visitor (`nl-BE`) would get English.
 */
function withLanguages(languages: string[] | undefined, language?: string) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { languages, language },
  });
  return () => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  };
}

describe("band invite codes", () => {
  it("generates 6-character codes from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      // 0/O and 1/I are excluded so a code read off a poster can be retyped.
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("does not repeat itself across many draws", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(450);
  });

  it("normalises e-mail addresses for case-insensitive matching", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("detectBrowserLanguage", () => {
  let restore: () => void = () => {};

  afterEach(() => {
    restore();
    restore = () => {};
  });

  it("collapses regional tags to their base language", () => {
    restore = withLanguages(["nl-BE"]);
    expect(detectBrowserLanguage()).toBe("nl");

    restore = withLanguages(["fr-CA"]);
    expect(detectBrowserLanguage()).toBe("fr");
  });

  it("prefers the first supported entry in the list", () => {
    restore = withLanguages(["de-DE", "fr-FR", "nl-NL"]);
    expect(detectBrowserLanguage()).toBe("fr");
  });

  it("falls back to navigator.language when languages is empty", () => {
    restore = withLanguages([], "nl-BE");
    expect(detectBrowserLanguage()).toBe("nl");
  });

  it("returns null when nothing matches", () => {
    restore = withLanguages(["ja-JP", "ko-KR"]);
    expect(detectBrowserLanguage()).toBeNull();

    restore = withLanguages([]);
    expect(detectBrowserLanguage()).toBeNull();
  });
});