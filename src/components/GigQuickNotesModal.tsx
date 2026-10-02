"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Gig } from "@/types";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";
import { AI_BOX, AI_BOX_TEXT, AI_SHEET } from "@/lib/ai-ui";

type Attachment = {
  id: string;
  url: string;
  type: "pdf" | "image" | string;
  title: string | null;
  mimeType: string | null;
};

type Summary = {
  headline: string;
  sections: Array<{ heading: string; items: string[] }>;
  unresolvedQuestions: string[];
};

interface GigQuickNotesModalProps {
  gig: Gig;
  isDutch: boolean;
  /** Called after notes are persisted so the card can refresh its note badge. */
  onNotesSaved?: (notes: string | null) => void;
  onClose: () => void;
}

/**
 * Quick "Notes & State of Play" drawer.
 *
 * Deliberately standalone instead of a route: the whole point is to read and
 * edit a note and fire one AI call from a gig card without losing the list you
 * were scrolling. Notes save through PATCH so the rest of the gig is untouched.
 */
export default function GigQuickNotesModal({
  gig,
  isDutch,
  onNotesSaved,
  onClose,
}: GigQuickNotesModalProps) {
  const { getAccessToken } = useAuth();

  // The dialog is portalled to <body>, so it must wait for the client before
  // touching the DOM — on the server there is no body to portal into.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [notes, setNotes] = useState(gig.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const copy = isDutch
    ? {
        title: "Notities & stand van zaken",
        notesLabel: "Notities",
        notesPlaceholder: "Bijv. soundcheck 16u, eigen pedalboard, 2x DI...",
        save: "Notities opslaan",
        saving: "Opslaan",
        saved: "Opgeslagen",
        saveFailed: "Opslaan mislukt",
        documents: "Documenten",
        documentsEmpty: "Geen documenten bijgevoegd.",
        loading: "Laden...",
        generate: "Stand van zaken genereren",
        regenerating: "Bezig met genereren...",
        analysing: "Analyseert documenten en notities...",
        questions: "Openstaande vragen",
        summarizedOn: "Samengevat op",
        close: "Sluiten",
        noDocsHint:
          "De samenvatting gebruikt je notities en de bijgevoegde documenten.",
      }
    : {
        title: "Notes & state of play",
        notesLabel: "Notes",
        notesPlaceholder: "e.g. soundcheck 16:00, own pedalboard, 2x DI...",
        save: "Save notes",
        saving: "Saving",
        saved: "Saved",
        saveFailed: "Could not save",
        documents: "Documents",
        documentsEmpty: "No documents attached.",
        loading: "Loading...",
        generate: "Generate state of play",
        regenerating: "Generating...",
        analysing: "Analysing documents and notes...",
        questions: "Unresolved questions",
        summarizedOn: "Summarized on",
        close: "Close",
        noDocsHint:
          "The summary uses your notes and any attached documents.",
      };

  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gig.id}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (Array.isArray(body)) setAttachments(body as Attachment[]);
    } catch {
      // Non-fatal: the drawer is still useful for notes without documents.
    } finally {
      setAttachmentsLoading(false);
    }
  }, [gig.id, getAccessToken]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  // Close on Escape so the drawer behaves like the app's other modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
async function handleSave() {
    setSaveError("");
    setSavedAt(null);
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gig.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || copy.saveFailed);
      const persisted = (body.gig?.notes as string | null) ?? null;
      setNotes(persisted ?? "");
      setSavedAt(new Date().toISOString());
      onNotesSaved?.(persisted);
    } catch (error) {
      setSaveError(
        `${copy.saveFailed}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(force: boolean) {
    setSummaryError("");
    setSummarising(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gig.id}/ai-summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Summary failed");
      setSummary(body.summary as Summary);
      setSummaryDate(body.generatedAt ?? null);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Summary failed");
    } finally {
      setSummarising(false);
    }
  }

  const isDirty = notes.trim() !== (gig.notes ?? "").trim();

  if (!mounted || typeof document === "undefined") return null;

  // Rendered into <body> so the dialog escapes any ancestor with `overflow`,
  // `transform` or a stacking context — inside a gig card those clipped the
  // sheet to the card box and put it behind sibling cards.
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4 modal-backdrop-enter"
      onClick={onClose}
      data-testid="gig-quick-notes-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        data-testid="gig-quick-notes-modal"
        onClick={(e) => e.stopPropagation()}
        // Mobile: bottom sheet, full width, scrollable, rounded top.
        // Desktop (>=sm): centred dialog with a max width.
        className={`${AI_SHEET} flex w-full max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-white shadow-2xl modal-sheet-mobile modal-content-enter sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl dark:border-slate-700/50 dark:bg-slate-900`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icons.Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`${AI_BOX_TEXT} text-base font-semibold text-slate-900 dark:text-white`}>
              {copy.title}
            </h2>
            <p className={`${AI_BOX_TEXT} mt-0.5 text-xs text-slate-500 dark:text-slate-400`}>
              {gig.eventName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            data-testid="gig-quick-notes-close"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        </div>
<div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4">
          {/* -- Notes ---------------------------------------------------- */}
          <div className="min-w-0">
            <label
              htmlFor="gig-quick-notes-input"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              {copy.notesLabel}
            </label>
            <textarea
              id="gig-quick-notes-input"
              data-testid="gig-quick-notes-input"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={copy.notesPlaceholder}
              className={`${AI_BOX_TEXT} rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100`}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !isDirty}
                data-testid="gig-quick-notes-save"
                className="touch-target inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {saving ? (
                  <Icons.Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="h-4 w-4" />
                )}
                {saving ? copy.saving : copy.save}
              </button>
              {savedAt && !saveError && (
                <span
                  data-testid="gig-quick-notes-saved"
                  className="text-xs text-emerald-600 dark:text-emerald-400"
                >
                  {copy.saved}{" "}
                  {new Date(savedAt).toLocaleTimeString(
                    isDutch ? "nl-BE" : "en-GB",
                    { hour: "2-digit", minute: "2-digit" }
                  )}
                </span>
              )}
            </div>

            {saveError && (
              <p
                data-testid="gig-quick-notes-save-error"
                className={`${AI_BOX} mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400`}
              >
                {saveError}
              </p>
            )}
          </div>

          {/* -- Documents ------------------------------------------------ */}
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              {copy.documents}
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                ({attachments.length})
              </span>
            </p>
            {attachmentsLoading ? (
              <p className="text-xs text-slate-500">{copy.loading}</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {copy.documentsEmpty}
              </p>
            ) : (
              <ul className="min-w-0 space-y-1.5">
                {attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800/40"
                  >
                    <Icons.Document className="h-4 w-4 shrink-0 text-slate-400" />
                    <span
                      className={`${AI_BOX_TEXT} flex-1 text-xs text-slate-700 dark:text-slate-200`}
                    >
                      {attachment.title || attachment.id}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-slate-400">{copy.noDocsHint}</p>
          </div>
{/* -- AI summary ---------------------------------------------- */}
          <div className="min-w-0 border-t border-slate-200 pt-4 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => void handleGenerate(Boolean(summary))}
              disabled={summarising}
              data-testid="gig-quick-notes-generate"
              className="touch-target inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            >
              {summarising ? (
                <Icons.Spinner className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.Sparkles className="h-4 w-4" />
              )}
              {summarising ? copy.regenerating : copy.generate}
            </button>

            {summarising && (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                {copy.analysing}
              </p>
            )}

            {summaryError && (
              <p
                data-testid="gig-quick-notes-summary-error"
                className={`${AI_BOX} mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400`}
              >
                {summaryError}
              </p>
            )}

            {summary && (
              <div
                data-testid="gig-quick-notes-summary"
                className={`${AI_BOX} mt-3 space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800/60 dark:bg-brand-950/20`}
              >
                <p
                  className={`${AI_BOX_TEXT} text-sm font-semibold text-slate-900 dark:text-white`}
                >
                  {summary.headline}
                </p>

                {summaryDate && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.summarizedOn}{" "}
                    {new Date(summaryDate).toLocaleString(
                      isDutch ? "nl-BE" : "en-GB",
                      { dateStyle: "medium", timeStyle: "short" }
                    )}
                  </p>
                )}

                {summary.sections
                  .filter((section) => section.items.length > 0)
                  .map((section) => (
                    <div key={section.heading} className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        {section.heading}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {section.items.map((item, index) => (
                          <li
                            key={index}
                            className={`${AI_BOX_TEXT} text-sm text-slate-700 dark:text-slate-200`}
                          >
                            - {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                {summary.unresolvedQuestions.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      {copy.questions}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {summary.unresolvedQuestions.map((question, index) => (
                        <li
                          key={index}
                          className={`${AI_BOX_TEXT} text-sm text-slate-700 dark:text-slate-200`}
                        >
                          ? {question}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}