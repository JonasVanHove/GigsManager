"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";
import { GigMessageDrafter } from "./GigMessageDrafter";

export type GigAttachmentItem = {
  id: string;
  url: string;
  storagePath: string | null;
  type: "pdf" | "image" | string;
  title: string | null;
  description: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string;
};

export type GigSummary = {
  headline: string;
  sections: Array<{ heading: string; items: string[] }>;
  unresolvedQuestions: string[];
};

interface GigAttachmentsPanelProps {
  gigId: string;
  /** Bilingual copy so the panel matches the rest of the form. */
  isDutch: boolean;
  className?: string;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.webp";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Gig documents + Groq "State of Play" summary.
 *
 * Rendered only for a saved gig (attachments hang off a persisted record), and
 * deliberately kept out of the gig form's dirty-state calculation: uploading a
 * document is not an edit of the gig itself.
 */
export function GigAttachmentsPanel({
  gigId,
  isDutch,
  className = "",
}: GigAttachmentsPanelProps) {
  const { getAccessToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<GigAttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [summary, setSummary] = useState<GigSummary | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const copy = isDutch
    ? {
        title: "Documenten & AI-samenvatting",
        upload: "Document toevoegen",
        uploading: "Uploaden",
        empty: "Nog geen documenten. Voeg een contract, rider of foto toe.",
        summarize: "Communicatie & notities samenvatten",
        regenerating: "Opnieuw genereren",
        questions: "Openstaande vragen",
        cached: "Samengevat op",
        remove: "Verwijderen",
      }
    : {
        title: "Documents & AI summary",
        upload: "Add document",
        uploading: "Uploading",
        empty: "No documents yet. Add a contract, rider or photo.",
        summarize: "Summarize communication & notes",
        regenerating: "Regenerating",
        questions: "Unresolved questions",
        cached: "Summarized on",
        remove: "Remove",
      };

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gigId}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAttachments((await res.json()) ?? []);
    } catch {
      // Non-fatal: the panel simply shows an empty list.
    } finally {
      setLoading(false);
    }
  }, [gigId, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadError("");

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(isDutch ? "Bestand is groter dan 8 MB." : "File is larger than 8 MB.");
      return;
    }

    setUploading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch(`/api/gigs/${gigId}/attachments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dataUrl, title: file.name }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }

      await load();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove(id: string) {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gigId}/attachments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // Ignore - the list refreshes on the next load.
    }
  }

  async function handleSummarize(force = false) {
    setSummaryError("");
    setSummarising(true);
    setShowSummary(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gigId}/ai-summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Summary failed");

      setSummary(body.summary);
      setSummaryDate(body.generatedAt ?? null);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Summary failed");
    } finally {
      setSummarising(false);
    }
  }

  return (
    <fieldset
      className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30 ${className}`}
    >
      <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {copy.title}
      </legend>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="touch-target inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {uploading ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            {uploading ? copy.uploading : copy.upload}
          </button>

          <button
            type="button"
            disabled={summarising}
            onClick={() => void handleSummarize(Boolean(summary))}
            className="touch-target inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {summarising ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.Sparkles className="h-4 w-4" />
            )}
            {summarising ? copy.regenerating : copy.summarize}
          </button>
        </div>

        {uploadError && (
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            {uploadError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
            ...
          </div>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {copy.empty}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <span className="shrink-0 text-slate-500">
                  {attachment.type === "pdf" ? (
                    <Icons.FileText className="h-4 w-4" />
                  ) : (
                    <Icons.Image className="h-4 w-4" />
                  )}
                </span>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
                  title={attachment.title ?? attachment.url}
                >
                  {attachment.title || attachment.url}
                </a>
                {attachment.fileSize ? (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatBytes(attachment.fileSize)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRemove(attachment.id)}
                  title={copy.remove}
                  aria-label={copy.remove}
                  className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {summaryError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400">
            {summaryError}
          </p>
        )}

        {showSummary && summarising && !summary && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
            {isDutch ? "Analyseert documenten..." : "Analysing documents..."}
          </div>
        )}

        {summary && (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800/60 dark:bg-brand-950/20">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {summary.headline}
            </p>

            {summaryDate && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {copy.cached}{" "}
                {new Date(summaryDate).toLocaleString(
                  isDutch ? "nl-BE" : "en-GB",
                  { dateStyle: "medium", timeStyle: "short" }
                )}
              </p>
            )}

            {summary.sections
              .filter((section) => section.items.length > 0)
              .map((section) => (
                <div key={section.heading}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {section.heading}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {section.items.map((item, index) => (
                      <li
                        key={index}
                        className="text-sm text-slate-700 dark:text-slate-200"
                      >
                        - {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

            {summary.unresolvedQuestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {copy.questions}
                </p>
                <ul className="mt-1 space-y-1">
                  {summary.unresolvedQuestions.map((question, index) => (
                    <li
                      key={index}
                      className="text-sm text-slate-700 dark:text-slate-200"
                    >
                      ? {question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <GigMessageDrafter gigId={gigId} isDutch={isDutch} />
      </div>
    </fieldset>
  );
}
