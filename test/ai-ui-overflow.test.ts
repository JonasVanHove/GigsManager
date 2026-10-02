import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AI_BOX, AI_BOX_PRE, AI_BOX_TEXT, AI_SHEET } from "@/lib/ai-ui";

/**
 * AI output boxes render API error strings: long English sentences containing
 * model ids, URLs and JSON keys with no spaces to break on. Without an explicit
 * wrap rule inside a flex/grid parent, a single such token widened the box past
 * 100vw and gave the whole page a horizontal scrollbar on mobile.
 */
describe("ai-ui class constants", () => {
  it("constrains the box itself", () => {
    expect(AI_BOX).toContain("max-w-full");
    expect(AI_BOX).toContain("w-full");
    expect(AI_BOX).toContain("min-w-0");
    expect(AI_BOX).toContain("overflow-x-hidden");
  });

  it("lets inner content break unbreakable tokens", () => {
    expect(AI_BOX_TEXT).toContain("break-words");
    expect(AI_BOX_TEXT).toContain("max-w-full");
  });

  it("keeps preformatted whitespace without overflowing", () => {
    expect(AI_BOX_PRE).toContain("whitespace-pre-wrap");
    expect(AI_BOX_PRE).toContain("break-words");
    expect(AI_BOX_PRE).toContain("max-w-full");
  });

  it("constrains sheets to the viewport", () => {
    expect(AI_SHEET).toContain("max-w-full");
    expect(AI_SHEET).toContain("overflow-x-hidden");
  });
});

const COMPONENTS = [
  "SetlistsTab",
  "GigAttachmentsPanel",
  "GigScheduleHelper",
  "GigMessageDrafter",
  "SetlistImportModal",
  "GigForm",
];

describe("AI components apply the overflow guards", () => {
  for (const name of COMPONENTS) {
    it(`${name} uses the shared AI box classes`, () => {
      const source = readFileSync(
        path.join(process.cwd(), "src", "components", `${name}.tsx`),
        "utf-8"
      );
      expect(source).toContain("@/lib/ai-ui");
      expect(source).toMatch(/AI_BOX|AI_BOX_TEXT|AI_BOX_PRE|AI_SHEET/);
    });
  }
});

describe("no AI box relies on bare `truncate` for wrapped text", () => {
  it("the import modal suggestion line can wrap", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "components", "SetlistImportModal.tsx"),
      "utf-8"
    );
    // A single-line suggestion must wrap, not ellipsize into invisibility.
    expect(source).toContain("[overflow-wrap:anywhere]");
  });
});
