/**
 * Print / "Save as PDF" generation for setlists (v1.39.0).
 *
 * Two layouts, because the two audiences need opposite things:
 *
 * - "stage" is what the band sees on a music stand: one page, huge type, key
 *   and tempo, and an unmistakable retune marker. Readable from two metres back
 *   on a dark stage.
 * - "playbook" is what the other half of the crew needs: logistics, contacts
 *   and arrangements, in as much detail as the setlist holds.
 *
 * The HTML is produced as a pure string so it can be asserted in unit tests.
 * The only impure part is `openPrintView`, which is deliberately kept at the
 * bottom and isolated.
 */

export type SetlistLayout = "stage" | "playbook";

/** Mirrors the `DraftItem` shape the setlist editor keeps. */
export interface PrintableItem {
  id?: string | null;
  kind?: string | null;
  songId?: string | null;
  label?: string | null;
  artist?: string | null;
  tuning?: string | null;
  key?: string | null;
  tempo?: string | null;
  notitie?: string | null;
  specialLabel?: string | null;
}

/** Row as the printer renders it. */
export interface PrintRow {
  index: number;
  title: string;
  kind: "song" | "special";
  key: string;
  /** Numeric BPM, or null when absent or unparseable. */
  bpm: number | null;
  tuning: string;
  notes: string;
  /** True when this row starts on a different tuning from the previous song. */
  retune: boolean;
}

export interface PrintOptions {
  /** Which sheet to produce. */
  layout: SetlistLayout;
  /** Print the key signature badge. */
  showKey: boolean;
  /** Print the tempo. */
  showBpm: boolean;
  /** Extra free-text note pinned to the top of the stage sheet. */
  stageNotes?: string;
  /** Skip rows that are not songs. On by default: the stage sheet is songs. */
  songsOnly?: boolean;
}

export interface PlaybookDetails {
  venueName?: string | null;
  venueLocation?: string | null;
  date?: string | null;
  doorsOpenTime?: string | null;
  soundcheckTime?: string | null;
  durationMinutes?: number | null;
  gearSetupNotes?: string | null;
  organizerName?: string | null;
  organizerEmail?: string | null;
  organizerPhone?: string | null;
  bandName?: string | null;
  lineup?: Array<{ name: string; notes?: string | null }>;
}

export interface PrintContext {
  setlistName: string;
  rows: PrintRow[];
  options: PrintOptions;
  playbook?: PlaybookDetails;
}

/** Escapes the five characters that can break out of text or an attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only real, plausible tempos; anything else is dropped rather than printed. */
function parseBpm(value: unknown): number | null {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 400) return null;
  return Math.round(parsed);
}

function sameTuning(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Turns editor items into printable rows.
 *
 * Blank rows are dropped: an empty line on a music stand reads as a missing
 * song rather than as an intentional gap.
 */
export function buildPrintRows(
  items: PrintableItem[] | null | undefined,
  options: { showKey: boolean; showBpm: boolean; songsOnly?: boolean }
): PrintRow[] {
  if (!Array.isArray(items)) return [];

  const cleaned = items
    .map((item) => {
      const isSpecial = item.kind === "special";
      const title = String(item.label ?? "").trim() || (isSpecial ? String(item.specialLabel ?? "").trim() : "");
      return {
        kind: isSpecial ? ("special" as const) : ("song" as const),
        title,
        key: String(item.key ?? "").trim(),
        bpm: parseBpm(item.tempo),
        tuning: String(item.tuning ?? "").trim(),
        notes: String(item.notitie ?? "").trim(),
      };
    })
    .filter((row) => {
      if (options.songsOnly !== false && row.kind === "special") return false;
      return row.title !== "" || row.notes !== "" || row.key !== "";
    });

  const rows: PrintRow[] = [];
  for (const row of cleaned) {
    const previous = rows[rows.length - 1];
    // A retune is only meaningful between two known tunings. Blank tunings are
    // missing data, not an instruction, and flagging them would be noise.
    const retune = Boolean(
      previous && row.tuning && previous.tuning && !sameTuning(row.tuning, previous.tuning)
    );

    rows.push({
      index: rows.length + 1,
      title: row.title || "—",
      kind: row.kind,
      key: options.showKey ? row.key : "",
      bpm: options.showBpm ? row.bpm : null,
      tuning: row.tuning,
      notes: row.notes,
      retune,
    });
  }

  return rows;
}

/* ── Stage sheet ───────────────────────────────────────────────────────── */

const PRINT_BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
      Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4; margin: 12mm; }
`;

/**
 * The stage sheet.
 *
 * Type is deliberately oversized and the retune marker is a filled block rather
 * than a symbol: under stage light, at a glance, from a metre away, shape
 * carries further than a word.
 */
export function buildStageSheetHtml(ctx: PrintContext): string {
  const { setlistName, rows, options } = ctx;
  const stageNotes = String(options.stageNotes ?? "").trim();

  const body = rows
    .map(
      (row) => `
      <li class="row${row.retune ? " retune" : ""}">
        <span class="num">${row.index}</span>
        <span class="title">${escapeHtml(row.title)}</span>
        ${
          row.retune
            ? `<span class="badge badge-retune">RETUNE · ${escapeHtml(row.tuning)}</span>`
            : ""
        }
        ${
          row.key
            ? `<span class="badge badge-key">${escapeHtml(row.key)}</span>`
            : ""
        }
        ${row.bpm !== null ? `<span class="bpm">${row.bpm}</span>` : ""}
        ${row.notes ? `<span class="notes">${escapeHtml(row.notes)}</span>` : ""}
      </li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(setlistName)} — Stage Setlist</title>
<style>
${PRINT_BASE_CSS}
  .sheet { padding: 4mm 2mm; }
  header { border-bottom: 3px solid #0f172a; padding-bottom: 6mm; margin-bottom: 6mm; }
  h1 { font-size: 30pt; margin: 0; letter-spacing: -0.02em; line-height: 1.05; }
  .subtitle { font-size: 11pt; color: #475569; margin-top: 2mm; font-weight: 600; }
  .stage-notes {
    margin: 0 0 6mm; padding: 4mm; border: 2px solid #0f172a;
    font-size: 12pt; font-weight: 600;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  .row {
    display: flex; align-items: baseline; gap: 5mm;
    padding: 4.5mm 0; border-bottom: 1px solid #cbd5e1;
    break-inside: avoid; page-break-inside: avoid;
  }
  .num { font-size: 16pt; font-weight: 700; color: #64748b; min-width: 10mm; }
  .title { font-size: 26pt; font-weight: 800; letter-spacing: -0.01em; flex: 1; }
  .badge {
    font-size: 12pt; font-weight: 800; padding: 1.5mm 3mm;
    border-radius: 2mm; border: 2px solid #0f172a; white-space: nowrap;
  }
  .badge-key { background: #0f172a; color: #fff; }
  .badge-retune { background: #b91c1c; color: #fff; border-color: #b91c1c; }
  .bpm { font-size: 15pt; font-weight: 700; color: #334155; min-width: 16mm; text-align: right; }
  .notes { font-size: 11pt; color: #475569; font-weight: 600; }
  /* A retuned song is called out by its own row, not just by the badge. */
  .row.retune { background: #fee2e2; padding-left: 3mm; padding-right: 3mm; }
  footer { margin-top: 8mm; font-size: 9pt; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <main class="sheet">
    <header>
      <h1>${escapeHtml(setlistName)}</h1>
      <p class="subtitle">Stage setlist · ${rows.length} ${rows.length === 1 ? "item" : "items"}</p>
    </header>
    ${stageNotes ? `<p class="stage-notes">${escapeHtml(stageNotes)}</p>` : ""}
    <ul>${body || '<li class="row"><span class="title">No songs on this setlist yet.</span></li>'}</ul>
    <footer>Generated by GigsManager</footer>
  </main>
</body>
</html>`;
}

/* ── Playbook ─────────────────────────────────────────────────────────── */

function definitionRow(label: string, value: string | number | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(text)}</td></tr>`;
}

/**
 * The band & tech playbook: logistics, contacts and lineup up front, then the
 * same setlist with its notes and arrangements intact.
 */
export function buildPlaybookHtml(ctx: PrintContext): string {
  const { setlistName, rows, playbook = {} } = ctx;

  const logistics = [
    definitionRow("Date", playbook.date),
    definitionRow("Venue", playbook.venueName),
    definitionRow("Address", playbook.venueLocation),
    definitionRow("Band", playbook.bandName),
    definitionRow("Doors", playbook.doorsOpenTime),
    definitionRow("Soundcheck", playbook.soundcheckTime),
    definitionRow("Set length", playbook.durationMinutes ? `${playbook.durationMinutes} min` : ""),
    definitionRow("Organizer", playbook.organizerName),
    definitionRow("Email", playbook.organizerEmail),
    definitionRow("Phone", playbook.organizerPhone),
  ]
    .filter(Boolean)
    .join("");

  const lineup = (playbook.lineup ?? [])
    .map(
      (member) =>
        `<li><strong>${escapeHtml(member.name)}</strong>${
          member.notes ? ` — ${escapeHtml(member.notes)}` : ""
        }</li>`
    )
    .join("");

  const songs = rows
    .map(
      (row) => `
      <tr>
        <td class="num">${row.index}</td>
        <td class="title">${escapeHtml(row.title)}</td>
        <td class="meta">${escapeHtml(row.key)}</td>
        <td class="meta">${row.bpm !== null ? row.bpm : ""}</td>
        <td class="meta">${escapeHtml(row.tuning)}${row.retune ? " <strong>(RETUNE)</strong>" : ""}</td>
        <td class="notes">${escapeHtml(row.notes)}</td>
      </tr>`
    )
    .join("");
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(setlistName)} — Band &amp; Tech Playbook</title>
<style>
${PRINT_BASE_CSS}
  .sheet { padding: 2mm; }
  h1 { font-size: 22pt; margin: 0 0 1mm; letter-spacing: -0.02em; }
  .subtitle { font-size: 10pt; color: #475569; font-weight: 600; margin: 0 0 6mm; }
  h2 {
    font-size: 12pt; text-transform: uppercase; letter-spacing: 0.08em;
    margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 2px solid #0f172a;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 2mm 3mm; vertical-align: top; font-size: 10.5pt; }
  thead th { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 1px solid #cbd5e1; }
  tbody tr { border-bottom: 1px solid #e2e8f0; break-inside: avoid; page-break-inside: avoid; }
  .logistics th { width: 34mm; color: #475569; font-weight: 700; }
  .num { width: 10mm; color: #64748b; font-weight: 700; }
  .title { font-weight: 700; }
  .meta { width: 22mm; color: #334155; }
  .notes { color: #475569; }
  ul { margin: 0; padding-left: 5mm; font-size: 10.5pt; }
  li { margin-bottom: 1.5mm; }
  .callout { padding: 3mm; background: #f1f5f9; font-size: 10.5pt; white-space: pre-wrap; }
  footer { margin-top: 8mm; font-size: 9pt; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <main class="sheet">
    <h1>${escapeHtml(setlistName)}</h1>
    <p class="subtitle">Band &amp; tech playbook</p>

    ${logistics ? `<h2>Logistics</h2><table class="logistics">${logistics}</table>` : ""}
    ${lineup ? `<h2>Line-up</h2><ul>${lineup}</ul>` : ""}
    ${playbook.gearSetupNotes ? `<h2>Notes for tech</h2><div class="callout">${escapeHtml(playbook.gearSetupNotes)}</div>` : ""}

    <h2>Set</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Song</th><th>Key</th><th>BPM</th><th>Tuning</th><th>Notes / arrangement</th></tr>
      </thead>
      <tbody>${songs || '<tr><td colspan="6">No songs on this setlist yet.</td></tr>'}</tbody>
    </table>

    <footer>Generated by GigsManager</footer>
  </main>
</body>
</html>`;
}
/** Renders whichever layout the options select. */
export function buildSetlistPrintHtml(ctx: PrintContext): string {
  return ctx.options.layout === "playbook"
    ? buildPlaybookHtml(ctx)
    : buildStageSheetHtml(ctx);
}

/** Convenience wrapper: editor items straight to HTML. */
export function generateSetlistPrintHtml(options: {
  setlistName: string;
  items: PrintableItem[];
  printOptions: PrintOptions;
  playbook?: PlaybookDetails;
}): string {
  return buildSetlistPrintHtml({
    setlistName: options.setlistName,
    rows: buildPrintRows(options.items, options.printOptions),
    options: options.printOptions,
    playbook: options.playbook,
  });
}

/**
 * Opens the print dialog for `html` in a hidden iframe.
 *
 * An iframe rather than a new tab or a data URL: it keeps the print dialog in
 * the same tab (no focus juggling on stage), and it does not trip the popup
 * blocker that a new window would on some mobile browsers.
 *
 * Returns false when there is no DOM, so callers can guard on the server.
 */
export function openPrintView(html: string): boolean {
  if (typeof document === "undefined") return false;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const cleanup = () => {
    // Give the print dialog a moment to snapshot before tearing the frame down.
    window.setTimeout(() => frame.remove(), 1000);
  };

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Firefox needs the document laid out before print() will include it.
  const run = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (err) {
      console.error("[pdf-export] print failed:", err);
    }
    cleanup();
  };

  if (frame.contentWindow?.document.readyState === "complete") {
    window.setTimeout(run, 100);
  } else {
    frame.onload = run;
  }

  return true;
}