import { describe, expect, it } from "vitest";
import { getBandMemberAvatarUrl, getBandMemberInitial } from "@/lib/member-avatar";

describe("band member avatar rules", () => {
  it("returns the authenticated profile image for Jonas", () => {
    expect(getBandMemberAvatarUrl("Jonas", null, "https://example.com/jonas.png")).toBe("https://example.com/jonas.png");
    expect(getBandMemberAvatarUrl("jonas", "https://example.com/other.png", "https://example.com/jonas.png")).toBe("https://example.com/jonas.png");
  });

  it("uses a custom avatar for non-Jonas members when one is set", () => {
    expect(getBandMemberAvatarUrl("Alex", "https://example.com/alex.png", "https://example.com/jonas.png")).toBe("https://example.com/alex.png");
  });

  it("falls back to the supplied fallback when the member has no own avatar", () => {
    // The signed-in viewer passes their Supabase profile image as the fallback so
    // their photo shows even when no BandMember row stores an avatar.
    expect(getBandMemberAvatarUrl("Bob", null, "https://example.com/bob.png")).toBe("https://example.com/bob.png");
    expect(getBandMemberAvatarUrl("Bob", "", "https://example.com/bob.png")).toBe("https://example.com/bob.png");
  });

  it("returns null (initials badge) when neither own nor fallback avatar exists", () => {
    expect(getBandMemberAvatarUrl("Bob", null, null)).toBeNull();
    expect(getBandMemberAvatarUrl("Bob", null, undefined)).toBeNull();
  });

  it("uses the first letter of the name for the fallback badge", () => {
    expect(getBandMemberInitial("Alex")).toBe("A");
    expect(getBandMemberInitial(" mark ")).toBe("M");
  });

  it("falls back to a question mark when no name is available", () => {
    expect(getBandMemberInitial(" ")).toBe("?");
  });
});