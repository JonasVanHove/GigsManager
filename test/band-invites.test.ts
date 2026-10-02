import { describe, it, expect } from "vitest";
import { generateInviteCode, normalizeEmail } from "@/lib/band-invites";

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