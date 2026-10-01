import { describe, it, expect } from "vitest";
import { findBestMatch, normalizeTitle, titleSimilarity } from "@/lib/setlist-fuzzy";

describe("setlist fuzzy matching", () => {
  it("normalises case, diacritics and punctuation", () => {
    expect(normalizeTitle("Don't Stop Me Now!")).toBe("don't stop me now");
    expect(normalizeTitle("  Café   Del Mar  ")).toBe("cafe del mar");
  });

  it("ignores per-gig annotations such as (Zinnia) or (Live)", () => {
    // The annotation must not reduce the score against the clean library title.
    expect(titleSimilarity("Blue Monday (Zinnia)", "Blue Monday")).toBe(1);
    expect(titleSimilarity("Blue Monday (Julot)", "Blue Monday")).toBe(1);
  });

  it("scores an exact match at 1", () => {
    expect(titleSimilarity("Mr. Blue Sky", "Mr. Blue Sky")).toBe(1);
  });

  it("scores clearly different titles below the auto-match threshold", () => {
    expect(titleSimilarity("BINDTEKST", "Mr. Blue Sky")).toBeLessThan(0.5);
  });

  it("finds the best candidate above the threshold", () => {
    const library = [
      { title: "Mr. Blue Sky", item: "blue" },
      { title: "Another Brick In The Wall", item: "brick" },
    ];
    const match = findBestMatch("Mr Blue Sky (Live)", library, 0.8);
    expect(match?.item).toBe("blue");
    expect(match?.score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns null when nothing is close enough", () => {
    const library = [{ title: "Mr. Blue Sky", item: "blue" }];
    expect(findBestMatch("Zzz Totally Unrelated", library, 0.8)).toBeNull();
  });

  it("handles an empty library", () => {
    expect(findBestMatch("Anything", [], 0.8)).toBeNull();
  });
});
