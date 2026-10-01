"use client";

import { useState } from "react";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";

type MessageKind = "rider" | "arrival" | "thankyou";

type DraftedMessage = {
  subject: string;
  body: string;
  channel: "email" | "whatsapp";
};

interface GigMessageDrafterProps {
  gigId: string;
  isDutch: boolean;
  className?: string;
}

const KINDS: Array<{ key: MessageKind; labelNl: string; labelEn: string }> = [
  {
    key: "rider",
    labelNl: "Technische rider & schema",
    labelEn: "Technical rider & schedule",
  },
  {
    key: "arrival",
    labelNl: "Aankomst bevestigen",
    labelEn: "Arrival confirmation",
  },
  {
    key: "thankyou",
    labelNl: "Bedankje & factuurherinnering",
    labelEn: "Thank you & invoice reminder",
  },
];

/**
 * Drafts an organiser/technician message from the gig's own data.
 *
 * The output is a starting point, never auto-sent: the manager reviews and
 * edits the text before it leaves the app.
 */
export function GigMessageDrafter({ gigId, isDutch, className = "" }: GigMessageDrafterProps) {
  const { getAccessToken } = useAuth();
  const [kind, setKind] = useState<MessageKind>("rider");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<DraftedMessage | null>(null);

  const copy = isDutch
    ? {
        title: "Bericht naar organisator genereren",
        generate: "Bericht genereren",
        working: "Bezig...",
        subject: "Onderwerp",
        copyToClipboard: "Kopieer",
        copied: "Gekopieerd",
      }
    : {
        title: "Generate organizer message",
        generate: "Generate message",
        working: "Working...",
        subject: "Subject",
        copyToClipboard: "Copy",
        copied: "Copied",
      };

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/gigs/${gigId}/ai-draft-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed");
      setMessage(body.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset
      className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30 ${className}`}
    >
      <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {copy.title}
      </legend>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setKind(option.key)}
            className={`min-w-0 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              kind === option.key
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {isDutch ? option.labelNl : option.labelEn}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        className="touch-target mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? (
          <Icons.Spinner className="h-4 w-4 animate-spin" />
        ) : (
          <Icons.Sparkles className="h-4 w-4" />
        )}
        {loading ? copy.working : copy.generate}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
        </p>
      )}

      {message && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-2">
            <span className="badge badge-neutral shrink-0">
              {message.channel === "whatsapp"
                ? "WhatsApp"
                : "E-mail"}
            </span>
            <CopyButton text={`${message.subject ? `${message.subject}\n\n` : ""}${message.body}`} label={copy.copyToClipboard} copiedLabel={copy.copied} isDutch={isDutch} />
          </div>
          {message.subject && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {copy.subject}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                {message.subject}
              </p>
            </div>
          )}
          <textarea
            readOnly
            value={message.body}
            rows={10}
            className="field text-sm"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </fieldset>
  );
}

function CopyButton({
  text,
  label,
  copiedLabel,
  isDutch,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  isDutch: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (plain http on a LAN/self-hosted).
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the textarea above is selectable by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      title={isDutch ? copiedLabel : label}
    >
      {copied ? (isDutch ? copiedLabel : label) : label}
    </button>
  );
}
