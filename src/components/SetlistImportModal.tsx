"use client";

import { useCallback, useRef, useState } from "react";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";

/** Mirrors the shape returned by POST /api/setlists/parse. */
export type ParsedImportItem = {
  index: number;
  kind: "song" | "special";
  title: string;
  raw: string;
  match: {
    songId: string;
    title: string;
    score: number;
    confidence: "high" | "low";
  } | null;
};

/** A reviewed row, ready to be merged into the setlist draft. */
export type ReviewedImportItem = {
  id: string;
  kind: "song" | "special";
  title: string;
  songId: string | null;
  notitie: string;
};

interface SetlistImportModalProps {
  isDutch: boolean;
  onClose: () => void;
  onConfirm: (items: ReviewedImportItem[]) => void;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function SetlistImportModal({
  isDutch,
  onClose,
  onConfirm,
}: SetlistImportModalProps) {
  const { getAccessToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ReviewedImportItem[]>([]);

  const copy = isDutch
    ? {
        title: "Setlist importeren",
        paste: "Tekst plakken",
        upload: "Foto uploaden",
        textarea: "Plak hier je setlist (nummering, BINDTEKST, aantekeningen...)",
        choose: "Kies een foto",
        parse: "Analyseren",
        parsing: "Bezig...",
        review: "Controleer en bevestig",
        confirm: "Toevoegen aan setlist",
        confirmed: (n: number) => `${n} items toegevoegd`,
        noText: "Voeg tekst of een foto toe voor je kan analyseren.",
        matched: "Gevonden",
        suggested: "Suggestie",
        unmatched: "Geen match",
        special: "Blok",
        rawLine: "Originele regel",
        empty: "Niets gevonden.",
        moveUp: "Omhoog",
        moveDown: "Omlaag",
        remove: "Verwijderen",
        hint: "Zeker groen: gekoppeld aan je bibliotheek. Blauw: check dit, wordt niet gekoppeld.",
      }
    : {
        title: "Import setlist",
        paste: "Paste text",
        upload: "Upload photo",
        textarea: "Paste your setlist here (numbering, BINDTEKST, annotations...)",
        choose: "Choose a photo",
        parse: "Analyse",
        parsing: "Working...",
        review: "Review and confirm",
        confirm: "Add to setlist",
        confirmed: (n: number) => `${n} items added`,
        noText: "Add some text or a photo before analysing.",
        matched: "Matched",
        suggested: "Suggestion",
        unmatched: "No match",
        special: "Marker",
        rawLine: "Original line",
        empty: "Nothing found.",
        moveUp: "Move up",
        moveDown: "Move down",
        remove: "Remove",
        hint: "Green: linked to your library. Blue: review it, it will not be linked.",
      };

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(isDutch ? "Kies een afbeelding." : "Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(isDutch ? "Foto is groter dan 6 MB." : "Photo is larger than 6 MB.");
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    setPreview(dataUrl);
  }, [isDutch]);

  function toReviewed(items: ParsedImportItem[]): ReviewedImportItem[] {
    return items.map((item, i) => ({
      id: `${i}-${item.title}`,
      kind: item.kind,
      // Only "high" confidence matches are linked; a low-confidence suggestion
      // is deliberately NOT turned into a songId (see /api/setlists/parse).
      songId: item.match?.confidence === "high" ? item.match.songId : null,
      title: item.match?.confidence === "high" ? item.match.title : item.title,
      notitie:
        item.match && item.match.confidence === "low"
          ? `${isDutch ? "Suggestie" : "Suggestion"}: ${item.match.title}`
          : "",
    }));
  }

  async function handleParse() {
    setError("");
    setParsing(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch("/api/setlists/parse", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          tab === "image" ? { imageDataUrl: preview } : { text }
        ),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Parse failed");

      setRawText(body.rawText || "");
      setRows(toReviewed(body.items ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function move(index: number, delta: number) {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const canParse = tab === "image" ? Boolean(preview) : text.trim().length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-sheet sm:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={isDutch ? "Sluiten" : "Close"}
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Icons.Close className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          {/* -- Source tabs ------------------------------------------- */}
          <div className="flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
            {(["text", "image"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTab(value); setError(""); }}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition ${
                  tab === value
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {value === "text" ? copy.paste : copy.upload}
              </button>
            ))}
          </div>

          {tab === "text" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={copy.textarea}
              className="field font-mono text-xs"
            />
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Icons.Image className="h-4 w-4" />
                {copy.choose}
              </button>
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt=""
                  className="max-h-56 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700"
                />
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          {rows.length === 0 ? (
            <button
              type="button"
              onClick={() => void handleParse()}
              disabled={parsing || !canParse}
              className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
            >
              {parsing && <Icons.Spinner className="h-4 w-4 animate-spin" />}
              {parsing ? copy.parsing : copy.parse}
            </button>
          ) : (
            !canParse && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {copy.noText}
              </p>
            )
          )}

          {/* -- Review grid ----------------------------------------- */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {copy.review} ({rows.length})
                </h3>
                <button
                  type="button"
                  onClick={() => { setRows([]); setRawText(""); }}
                  className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
                >
                  {isDutch ? "Opnieuw" : "Start over"}
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">{copy.hint}</p>

              {rawText && (
                <details className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                    {isDutch ? "Gelezen tekst" : "Read text"}
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
                    {rawText}
                  </pre>
                </details>
              )}

              <ul className="space-y-2">
                {rows.map((row, index) => (
                  <li
                    key={row.id}
                    className="flex min-w-0 items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/60"
                  >
                    <span className="mt-0.5 w-6 shrink-0 text-center text-xs font-semibold text-slate-500">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <input
                        value={row.title}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, title: e.target.value } : r
                            )
                          )
                        }
                        className="field !py-1.5 text-sm"
                      />
                      {row.notitie && (
                        <p className="mt-1 truncate text-xs text-brand-600 dark:text-brand-400">
                          {row.notitie}
                        </p>
                      )}
                    </div>

                    <span
                      className={`badge shrink-0 ${
                        row.kind === "special"
                          ? "badge-neutral"
                          : row.songId
                            ? "badge-confirmed"
                            : "badge-option"
                      }`}
                    >
                      {row.kind === "special"
                        ? copy.special
                        : row.songId
                          ? copy.matched
                          : row.notitie
                            ? copy.suggested
                            : copy.unmatched}
                    </span>

                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        title={copy.moveUp}
                        aria-label={copy.moveUp}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Icons.ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        title={copy.moveDown}
                        aria-label={copy.moveDown}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Icons.ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, i) => i !== index))
                        }
                        title={copy.remove}
                        aria-label={copy.remove}
                        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Icons.X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white pt-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target min-h-[44px] rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {isDutch ? "Annuleren" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(rows)}
                  className="touch-target min-h-[44px] rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
                >
                  {copy.confirm}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
