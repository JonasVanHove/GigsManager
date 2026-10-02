"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";
import { AI_BOX, AI_BOX_TEXT, AI_SHEET } from "@/lib/ai-ui";

interface BandInviteModalProps {
  bandId: string;
  bandName: string;
  isDutch: boolean;
  onClose: () => void;
}

/** Same alphabet the server generates with; rejects anything else up front. */
const CODE_PATTERN = /^[A-Z2-9]{6}$/;

/**
 * Band invite dialog: QR code + the same code as plain text.
 *
 * The QR is rendered from the link, but the human-readable code sits next to
 * it because a QR needs a camera and a six-character code does not.
 */
export default function BandInviteModal({
  bandId,
  bandName,
  isDutch,
  onClose,
}: BandInviteModalProps) {
  const { getAccessToken } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const copy = isDutch
    ? {
        title: "Uitnodiging",
        subtitle: "Scan de QR-code of typ de code handmatig.",
        codeLabel: "Code",
        copyLink: "Uitnodigingslink kopiëren",
        copied: "Gekopieerd!",
        regenerate: "Nieuwe code genereren",
        loading: "Code genereren...",
        failed: "Kon geen code genereren",
        copyFailed: "Kopiëren niet gelukt",
        close: "Sluiten",
        steps: "Wat nu? Deel dit met je bandmaat. Zodra die inlogt met hetzelfde e-mailadres, verschijnen de gedeelde optredens direct in hun dashboard.",
      }
    : {
        title: "Invite",
        subtitle: "Scan the QR code or type the code by hand.",
        codeLabel: "Code",
        copyLink: "Copy invite link",
        copied: "Copied!",
        regenerate: "Generate new code",
        loading: "Generating code...",
        failed: "Could not generate a code",
        copyFailed: "Could not copy",
        close: "Close",
        steps: "What next? Share this with your bandmate. As soon as they sign in with the same email address, the shared gigs appear on their dashboard.",
      };

  const fetchInvite = useCallback(
    async (regenerate = false) => {
      setLoading(true);
      setError("");
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/bands/invite", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bandId, regenerate }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || copy.failed);

        const nextCode = String(body.code || "").toUpperCase();
        if (!CODE_PATTERN.test(nextCode)) throw new Error(copy.failed);
        setCode(nextCode);
        setLink(String(body.link));

        // Only ever encode a validated code plus a fixed origin, never raw input.
        const svg = await QRCode.toString(String(body.link), {
          type: "svg",
          margin: 1,
          width: 220,
          errorCorrectionLevel: "M",
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrSvg(svg);
      } catch (err) {
        setError(err instanceof Error ? err.message : copy.failed);
        setQrSvg(null);
      } finally {
        setLoading(false);
      }
    },
    [bandId, getAccessToken, copy.failed]
  );

  useEffect(() => {
    void fetchInvite(false);
  }, [fetchInvite]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(copy.copyFailed);
    }
  }
return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-md sm:items-center sm:px-4 sm:py-4 modal-backdrop-enter"
      onClick={onClose}
      data-testid="band-invite-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        data-testid="band-invite-modal"
        onClick={(e) => e.stopPropagation()}
        className={`modal-sheet-mobile ${AI_SHEET} max-h-[92vh] w-full overflow-y-auto overflow-x-hidden rounded-t-2xl border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95 sm:max-w-md sm:rounded-2xl modal-content-enter`}
      >
        <div className="flex items-start gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-slate-700/60">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icons.Plus className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className={`${AI_BOX_TEXT} text-base font-semibold text-slate-900 dark:text-white`}
            >
              {copy.title}
            </h2>
            <p
              className={`${AI_BOX_TEXT} mt-0.5 text-xs text-slate-500 dark:text-slate-400`}
            >
              {bandName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            data-testid="band-invite-close"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Icons.Spinner className="h-4 w-4 animate-spin" />
              {copy.loading}
            </p>
          ) : error ? (
            <p
              data-testid="band-invite-error"
              className={`${AI_BOX} rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400`}
            >
              {error}
            </p>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                {qrSvg && (
                  <div
                    data-testid="band-invite-qr"
                    aria-label={isDutch ? "QR-code" : "QR code"}
                    className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700"
                    // SVG produced locally by `qrcode` from a validated invite
                    // link; no user-controlled markup reaches this string.
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                )}
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {copy.codeLabel}
                  </p>
                  <p
                    data-testid="band-invite-code"
                    className="font-mono text-2xl font-bold tracking-[0.3em] text-slate-900 dark:text-white"
                  >
                    {code}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleCopy()}
                data-testid="band-invite-copy"
                className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900"
              >
                {copied ? (
                  <Icons.Check className="h-4 w-4" />
                ) : (
                  <Icons.Copy className="h-4 w-4" />
                )}
                {copied ? copy.copied : copy.copyLink}
              </button>

              <button
                type="button"
                onClick={() => void fetchInvite(true)}
                data-testid="band-invite-regenerate"
                className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Icons.Refresh className="h-4 w-4" />
                {copy.regenerate}
              </button>

              <p className={`${AI_BOX_TEXT} text-xs text-slate-500 dark:text-slate-400`}>
                {copy.steps}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}