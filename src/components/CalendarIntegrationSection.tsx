"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastContainer";
import { Icons } from "./Icons";

/**
 * iCal subscription management (v1.36.0).
 *
 * The feed URL contains a bearer-equivalent token and is only ever revealed in
 * the response that creates it, because the server stores just the hash. So
 * this panel deliberately cannot show the link again after a reload: it reports
 * that a feed exists and offers regeneration, which is the only honest option.
 */
export default function CalendarIntegrationSection() {
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [active, setActive] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/calendar/token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      setActive(Boolean(body.active));
      // The stored token is hashed, so there is nothing to display here.
      setUrl(null);
    } catch {
      // Leave the panel in its unknown state rather than blocking settings.
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Creates a token, or replaces the existing one. */
  const generate = useCallback(async () => {
    setWorking(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("no-session");
      const res = await fetch("/api/calendar/token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "generate-failed");

      setUrl(body.url);
      setActive(true);
      toast.success(t('settings.calendarActive'));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(
        message && message !== "no-session" && message !== "generate-failed"
          ? message
          : t('settings.errorSaveFailed')
      );
    } finally {
      setWorking(false);
    }
  }, [getAccessToken, toast, t]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some embedded contexts; the read-only
      // field below still lets the user copy by hand.
      toast.error(t('settings.errorSaveFailed'));
    }
  }, [url, toast, t]);

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-50/40 p-4 backdrop-blur dark:border-sky-500/20 dark:bg-sky-950/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
          <Icons.Calendar className="h-3.5 w-3.5" />
        </span>
        <label className="text-sm font-semibold text-sky-700 dark:text-sky-300">
          {t('settings.calendarIntegration')}
        </label>
      </div>

      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        {t('settings.calendarIntro')}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-slate-500 dark:text-slate-400">
          <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
          {t('settings.saving')}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            {active ? t('settings.calendarActive') : t('settings.calendarInactive')}
          </p>

          {/* The URL is only available in the response that created it. */}
          {url && (
            <div className="mb-3 space-y-2">
              <input
                readOnly
                value={url}
                aria-label={t('settings.calendarCopy')}
                data-testid="calendar-subscription-url"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-slate-300/60 bg-white/80 px-3 py-2.5 font-mono text-xs text-slate-900 shadow-sm dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void copy()}
                data-testid="calendar-copy"
                className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {copied ? <Icons.Check className="h-4 w-4" /> : <Icons.Copy className="h-4 w-4" />}
                {copied ? t('settings.calendarCopied') : t('settings.calendarCopy')}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void generate()}
            disabled={working}
            data-testid="calendar-generate"
            className="touch-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
          >
            <Icons.Refresh className="h-4 w-4" />
            {/* Once a feed exists the only way to get a URL is to rotate it. */}
            {active ? t('settings.calendarRegenerate') : t('settings.calendarGenerate')}
          </button>
        </>
      )}

      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        {t('settings.calendarOnlyAttending')}
      </p>

      <div className="mt-3 rounded-xl bg-white/60 p-3 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        <p className="mb-1 font-semibold">{t('settings.calendarHowTo')}</p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>{t('settings.calendarGoogle')}</li>
          <li>{t('settings.calendarApple')}</li>
          <li>{t('settings.calendarOutlook')}</li>
        </ul>
      </div>

      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
        {t('settings.calendarSecurity')}
      </p>
    </div>
  );
}
