import { describe, it, expect } from "vitest";
import { getBandColorStyles } from "@/lib/preferences";

describe("band tag contrast", () => {
  // Dark text is slate-900 (#0f172a) — the app's design-system token used
  // across the UI (text-slate-900, dark bg #0f172a). getContrastColor was
  // intentionally switched from gray-900 (#111827) to slate-900 with a WCAG
  // 2.0 luminance threshold of 0.5 (see commit 4d2c240); these expectations
  // pin that contract.
  it("uses dark text on light backgrounds", () => {
    const styles = getBandColorStyles("Test", "#fef3c7");
    expect(styles.solid.color).toBe("#0f172a");
    expect(styles.soft.color).toBe("#0f172a");
  });

  it("uses light text on dark backgrounds", () => {
    const styles = getBandColorStyles("Test", "#1d4ed8");
    expect(styles.solid.color).toBe("#ffffff");
    expect(styles.soft.color).toBe("#ffffff");
  });

  it("uses light text for black backgrounds", () => {
    const styles = getBandColorStyles("Test", "#000000");
    expect(styles.solid.color).toBe("#ffffff");
  });

  it("uses dark text for bright green backgrounds", () => {
    const styles = getBandColorStyles("Test", "#86efac");
    expect(styles.solid.color).toBe("#0f172a");
  });
});
