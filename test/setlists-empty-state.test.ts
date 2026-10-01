import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The empty state is the first thing a new account sees, and it used to hide
 * the one action most musicians actually want: importing an existing setlist
 * from text or a photo. The Import button only existed inside the editor, which
 * requires an existing setlist - so it was unreachable with zero setlists.
 */
const SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "SetlistsTab.tsx"),
  "utf-8"
);

describe("setlists empty state", () => {
  it("offers the import action from the empty state", () => {
    expect(SOURCE).toContain("setShowImportModal(true)");
  });

  it("creates a setlist when importing without an open draft", () => {
    // Guards the silent no-op: updateDraftItems is a no-op when draft is null.
    expect(SOURCE).toContain("createSetlistFromImport");
    expect(SOURCE).toMatch(/if\s*\(!draft\)\s*\{\s*\n\s*await createSetlistFromImport/);
  });

  it("defines selectSetlist before the callbacks that use it", () => {
    const selectAt = SOURCE.indexOf("const selectSetlist = useCallback");
    const importAt = SOURCE.indexOf("const applyImportedItems = useCallback");
    const createAt = SOURCE.indexOf("const createSetlistFromImport = useCallback");
    expect(selectAt).toBeGreaterThan(-1);
    // A reference before the declaration throws at render time (TDZ), which is
    // exactly the class of bug that silently broke the empty-state flow.
    expect(selectAt).toBeLessThan(createAt);
    expect(createAt).toBeLessThan(importAt);
  });
});
