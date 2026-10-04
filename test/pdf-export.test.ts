import { describe, expect, it } from "vitest";
import {
  buildPlaybookHtml,
  buildPrintRows,
  buildSetlistPrintHtml,
  buildStageSheetHtml,
  escapeHtml,
  generateSetlistPrintHtml,
  type PrintableItem,
  type PrintOptions,
} from "@/lib/pdf-export";

const opts = (over: Partial<PrintOptions> = {}): PrintOptions => ({
  layout: "stage",
  showKey: true,
  showBpm: true,
  ...over,
});

const song = (over: Partial<PrintableItem> = {}): PrintableItem => ({
  id: "a",
  kind: "song",
  songId: "s1",
  label: "Wonderwall",
  artist: "Oasis",
  tuning: "Standard",
  key: "Am",
  tempo: "103",
  notitie: "",
  specialLabel: "",
  ...over,
});

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("escapes ampersands before the entities it introduces", () => {
    expect(escapeHtml("Fish & Chips")).toBe("Fish &amp; Chips");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("treats null and undefined as empty", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("buildPrintRows", () => {
  it("returns nothing for an absent list", () => {
    expect(buildPrintRows(null, opts())).toEqual([]);
    expect(buildPrintRows(undefined, opts())).toEqual([]);
  });

  it("numbers rows from one in order", () => {
    const rows = buildPrintRows(
      [song({ label: "One" }), song({ label: "Two" }), song({ label: "Three" })],
      opts()
    );
    expect(rows.map((r) => [r.index, r.title])).toEqual([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
    ]);
  });

  it("drops entirely blank rows", () => {
    const rows = buildPrintRows(
      [song({ label: "One" }), song({ label: "", key: "", notitie: "" }), song({ label: "Two" })],
      opts()
    );
    expect(rows).toHaveLength(2);
  });

  it("parses bpm and ignores nonsense", () => {
    const rows = buildPrintRows(
      [
        song({ label: "A", tempo: "103" }),
        song({ label: "B", tempo: "128 bpm" }),
        song({ label: "C", tempo: "" }),
        song({ label: "D", tempo: "Allegro" }),
      ],
      opts()
    );
    // 128 bpm is not a number and must not print as NaN.
    expect(rows.map((r) => r.bpm)).toEqual([103, null, null, null]);
  });

  it("hides keys and bpm when the toggles are off", () => {
    const rows = buildPrintRows([song({ key: "Am", tempo: "103" })], opts({ showKey: false, showBpm: false }));
    expect(rows[0].key).toBe("");
    expect(rows[0].bpm).toBeNull();
    // Hiding a column is not deleting the underlying data.
    expect(rows[0].tuning).toBe("Standard");
  });
});

describe("retune detection", () => {
  it("flags the first song that changes tuning", () => {
    const rows = buildPrintRows(
      [song({ tuning: "Standard" }), song({ tuning: "Drop D" }), song({ tuning: "Drop D" })],
      opts()
    );
    expect(rows.map((r) => r.retune)).toEqual([false, true, false]);
  });

  it("does not flag the very first song", () => {
    const rows = buildPrintRows([song({ tuning: "Drop D" })], opts());
    expect(rows[0].retune).toBe(false);
  });

  it("ignores a blank tuning on either side", () => {
    // Missing data is not an instruction to retune.
    const rows = buildPrintRows(
      [song({ tuning: "Standard" }), song({ tuning: "" }), song({ tuning: "Drop D" })],
      opts()
    );
    expect(rows.map((r) => r.retune)).toEqual([false, false, false]);
  });

  it("compares tunings case-insensitively", () => {
    const rows = buildPrintRows([song({ tuning: "drop d" }), song({ tuning: "DROP D" })], opts());
    expect(rows[1].retune).toBe(false);
  });
});
describe("special blocks", () => {
  it("excludes special blocks from the stage sheet by default", () => {
    const rows = buildPrintRows(
      [song(), song({ kind: "special", label: "Encore", specialLabel: "Encore" })],
      opts()
    );
    expect(rows.map((r) => r.title)).toEqual(["Wonderwall"]);
  });

  it("includes them when songsOnly is false", () => {
    const rows = buildPrintRows(
      [song(), song({ kind: "special", label: "Encore", specialLabel: "Encore" })],
      opts({ songsOnly: false })
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].kind).toBe("special");
  });
});

describe("stage sheet html", () => {
  /** Markup only: the stylesheet legitimately defines .badge-key/.stage-notes. */
  const body = (document: string) => document.replace(/<style>[\s\S]*?<\/style>/g, "");

  const html = (items: PrintableItem[], over: Partial<PrintOptions> = {}) =>
    buildStageSheetHtml({
      setlistName: "Friday at The Annex",
      rows: buildPrintRows(items, opts(over)),
      options: opts(over),
    });

  it("renders large titles and the retune badge", () => {
    const out = html([
      song({ label: "Alpha", tuning: "Standard" }),
      song({ label: "Beta", tuning: "Drop D" }),
    ]);
    expect(out).toContain("Alpha");
    expect(out).toContain("Beta");
    expect(out).toContain("RETUNE · Drop D");
    // The stage sheet's whole job is legibility from a distance.
    expect(out).toMatch(/\.title \{ font-size: 26pt/);
  });

  it("prints the key and bpm badges", () => {
    const out = html([song({ key: "Am", tempo: "103" })]);
    expect(out).toContain("badge-key");
    expect(out).toContain(">Am<");
    expect(out).toContain("103");
  });

  it("omits the key and bpm when disabled", () => {
    const out = body(
      html([song({ key: "Am", tempo: "103" })], { showKey: false, showBpm: false })
    );
    expect(out).not.toContain("badge-key");
    expect(out).not.toContain("103");
  });

  it("includes custom stage notes only when provided", () => {
    expect(html([song()], { stageNotes: "  Hard out  " })).toContain("Hard out");
    expect(body(html([song()], { stageNotes: "   " }))).not.toContain("stage-notes");
  });

  it("escapes song titles and notes", () => {
    const out = html([song({ label: "<script>alert(1)</script>", notitie: "a & b" })]);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("a &amp; b");
  });

  it("escapes the setlist name in the title", () => {
    const out = buildStageSheetHtml({
      setlistName: "Bobby & Co <live>",
      rows: [],
      options: opts(),
    });
    expect(out).toContain("Bobby &amp; Co &lt;live&gt;");
  });

  it("says so when there are no songs instead of printing an empty page", () => {
    const out = html([]);
    expect(out).toContain("No songs on this setlist yet.");
  });
});

describe("playbook html", () => {
  it("renders logistics, line-up and notes for tech", () => {
    const out = buildPlaybookHtml({
      setlistName: "Annex",
      rows: buildPrintRows([song({ label: "Alpha" })], opts()),
      options: opts({ layout: "playbook" }),
      playbook: {
        venueName: "The Annex",
        venueLocation: "Rotterdam",
        date: "2026-04-12",
        soundcheckTime: "18:00",
        durationMinutes: 90,
        organizerName: "Sam",
        organizerEmail: "sam@example.com",
        bandName: "The Tones",
        lineup: [{ name: "Sam", notes: "guitar" }],
        gearSetupNotes: "DI box for bass",
      },
    });
    expect(out).toContain("Logistics");
    expect(out).toContain("The Annex");
    expect(out).toContain("Soundcheck");
    expect(out).toContain("18:00");
    expect(out).toContain("90 min");
    expect(out).toContain("sam@example.com");
    expect(out).toContain("Line-up");
    expect(out).toContain("guitar");
    expect(out).toContain("Notes for tech");
    expect(out).toContain("DI box for bass");
  });

  it("omits empty sections entirely", () => {
    const out = buildPlaybookHtml({
      setlistName: "Annex",
      rows: [],
      options: opts({ layout: "playbook" }),
      playbook: {},
    });
    expect(out).not.toContain("<h2>Logistics</h2>");
    expect(out).not.toContain("<h2>Line-up</h2>");
  });

  it("marks retunes in the set table", () => {
    const out = buildPlaybookHtml({
      setlistName: "Annex",
      rows: buildPrintRows(
        [song({ tuning: "Standard" }), song({ tuning: "Drop D" })],
        opts()
      ),
      options: opts({ layout: "playbook" }),
    });
    expect(out).toContain("(RETUNE)");
  });
});

describe("buildSetlistPrintHtml / generateSetlistPrintHtml", () => {
  it("routes to the layout the options select", () => {
    const base = {
      setlistName: "Annex",
      rows: buildPrintRows([song()], opts()),
    };
    expect(buildSetlistPrintHtml({ ...base, options: opts({ layout: "stage" }) })).toContain(
      "Stage setlist"
    );
    expect(buildSetlistPrintHtml({ ...base, options: opts({ layout: "playbook" }) })).toContain(
      "Band &amp; tech playbook"
    );
  });

  it("builds straight from editor items", () => {
    const out = generateSetlistPrintHtml({
      setlistName: "Annex",
      items: [song({ label: "Alpha", key: "C", tempo: "90" })],
      printOptions: opts(),
    });
    expect(out).toContain("Alpha");
    expect(out).toContain(">C<");
  });
});

