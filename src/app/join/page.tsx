"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Icons } from "@/components/Icons";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAuth } from "@/components/AuthProvider";
import { LandingLanguageProvider } from "@/components/LandingLanguageProvider";
import { useLandingLanguage } from "@/lib/landing-i18n";
import { AI_BOX, AI_BOX_TEXT } from "@/lib/ai-ui";

type InvitePreview = {
  band: { id: string; name: string; color: string | null; logoUrl: string | null };
  alreadyMember: boolean;
};

const CODE_LENGTH = 6;

/** Same alphabet the server generates with; mirrored here to validate input. */
const CODE_PATTERN = /^[A-Z2-9]{1,6}$/;

function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAccessToken, session, isLoading } = useAuth();
  const { copy: t } = useLandingLanguage();

  const initialCode = normalizeCode(searchParams.get("code") || "");
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const copy = {
    ...t.join,
    invited: (band: string) => `${t.join.invitedTo} ${band}${t.join.invitedSuffix}`,
  };

  const loadPreview = useCallback(
    async (value: string) => {
      setError("");
      setPreview(null);
      if (value.length !== CODE_LENGTH) return;
      if (!CODE_PATTERN.test(value)) {
        setError(copy.invalidCode);
        return;
      }

      setPreviewing(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/bands/invite?code=${encodeURIComponent(value)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError(body?.error || copy.unknownCode);
          return;
        }
        setPreview(body as InvitePreview);
      } catch {
        setError(copy.unknownCode);
      } finally {
        setPreviewing(false);
      }
    },
    [getAccessToken]
  );

  // Arriving from a scanned QR link pre-fills and immediately checks the code.
  useEffect(() => {
    if (initialCode.length === CODE_LENGTH) void loadPreview(initialCode);
  }, [initialCode, loadPreview]);

  async function handleJoin() {
    if (!preview) return;
    setJoining(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/bands/join", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || copy.unknownCode);
        return;
      }
      router.push("/app");
    } catch {
      setError(copy.unknownCode);
    } finally {
      setJoining(false);
    }
  }

  const codeComplete = code.length === CODE_LENGTH;
  const canSubmit = codeComplete && Boolean(preview) && !previewing;
return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-end gap-2">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600">
            <Icons.Users className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className={`${AI_BOX_TEXT} mt-1 text-sm text-slate-400`}>{copy.subtitle}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          {!isLoading && !session && (
            <p
              data-testid="join-needs-account"
              className={`${AI_BOX} mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-200`}
            >
              {copy.needAccount}
            </p>
          )}

          <label
            htmlFor="join-code"
            className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            {copy.codeLabel}
          </label>
          <input
            id="join-code"
            data-testid="join-code-input"
            value={code}
            onChange={(e) => {
              const next = normalizeCode(e.target.value).slice(0, CODE_LENGTH);
              setCode(next);
              void loadPreview(next);
            }}
            placeholder="ABC123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className={`${AI_BOX_TEXT} rounded-xl border border-white/15 bg-slate-900/60 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none`}
          />

          {previewing && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
              {copy.checking}
            </p>
          )}

          {error && (
            <p
              data-testid="join-error"
              className={`${AI_BOX} mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-medium text-red-200`}
            >
              {error}
            </p>
          )}

          {preview && (
            <div
              data-testid="join-preview"
              className={`${AI_BOX} mt-4 rounded-xl border border-brand-400/30 bg-brand-500/10 p-3 text-center`}
            >
              <p className={`${AI_BOX_TEXT} text-sm font-semibold text-white`}>
                {copy.invited(preview.band.name)}
              </p>
              {preview.alreadyMember && (
                <p className="mt-1 text-xs text-slate-300">{copy.alreadyMember}</p>
              )}
            </div>
          )}

          {preview?.alreadyMember ? (
            <button
              type="button"
              onClick={() => router.push("/app")}
              data-testid="join-dashboard"
              className="touch-target mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {copy.goToDashboard}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={!canSubmit || joining}
              data-testid="join-submit"
              className="touch-target mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {joining && <Icons.Spinner className="h-4 w-4 animate-spin" />}
              {joining ? copy.joining : copy.cta}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    // detectBrowser: someone scanning a band QR usually has no stored
    // preference, so fall back to what their browser asks for (nl-BE -> nl).
    <LandingLanguageProvider detectBrowser>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-slate-950">
            <LoadingSpinner size="lg" message="Loading..." />
          </div>
        }
      >
        <JoinContent />
      </Suspense>
    </LandingLanguageProvider>
  );
}