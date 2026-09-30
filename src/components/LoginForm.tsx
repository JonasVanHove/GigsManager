"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";
import { useAuth } from "./AuthProvider";
import type { SignUpResult } from "./AuthProvider";

const REMEMBERED_EMAIL_KEY = "gigsmanager:remembered-email";

function readRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

function writeRememberedEmail(email: string): void {
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Storage unavailable (private mode) — remembering is simply skipped.
  }
}

/** Turns Supabase auth errors into something a returning user can act on. */
function friendlyAuthError(raw: string, isSignUp: boolean): string {
  const message = raw.toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "E-mailadres of wachtwoord klopt niet. Controleer je gegevens of maak een account aan.";
  }
  if (message.includes("email not confirmed")) {
    return "Je account is nog niet bevestigd. Klik op de link in de bevestigingsmail.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Dit e-mailadres is al geregistreerd. Log in met je wachtwoord.";
  }
  if (message.includes("password should be at least")) {
    return "Kies een wachtwoord van minimaal 6 tekens.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Te veel pogingen. Wacht een minuut en probeer het opnieuw.";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Geen verbinding met de server. Controleer je internetverbinding.";
  }
  return isSignUp ? `Registreren mislukt: ${raw}` : `Inloggen mislukt: ${raw}`;
}

export function LoginForm() {
  const { signIn, signUp, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Returning users: prefill the remembered e-mail and focus the password
  // field, so signing in takes a single action (type password → Enter).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const remembered = readRememberedEmail();
    if (remembered) setEmail(remembered);
    else emailRef.current?.focus();
  }, []);

  const switchMode = (next: boolean) => {
    setIsSignUp(next);
    setError("");
    setSuccessMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setSubmitting(true);

    try {
      if (isSignUp) {
        const result: SignUpResult = await signUp(email.trim(), password);

        if (result === "confirm-email") {
          setSuccessMsg(
            `Account created! We've sent a confirmation email to ${email.trim()}. ` +
            `Please check your inbox (and spam folder) and click the verification link before signing in.`
          );
          setPassword("");
        } else {
          // Signed in directly (email verification disabled)
          setSuccessMsg("Account created and signed in!");
        }
      } else {
        // Remember the e-mail so returning users only need their password.
        writeRememberedEmail(email.trim());
        await signIn(email.trim(), password);
        // signIn triggers onAuthStateChange which updates session automatically
      }
    } catch (err: any) {
      setError(friendlyAuthError(err?.message || String(err), isSignUp));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isLoading || submitting;
  const canQuickSignIn = !busy && email.trim().length > 0 && password.length > 0;

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl border border-slate-200/50 bg-white/80 backdrop-blur p-8 shadow-xl dark:border-slate-700/50 dark:bg-slate-900/80 dark:backdrop-blur dark:shadow-2xl">
      <h2 className="mb-8 text-center text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
        {isSignUp ? "Create Account" : "Sign In"}
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200/60 bg-slate-100/60 p-1 dark:border-slate-700/60 dark:bg-slate-800/60">
        {[
          { key: false, label: "Sign In" },
          { key: true, label: "Create Account" },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => switchMode(tab.key)}
            disabled={busy}
            aria-pressed={isSignUp === tab.key}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
              isSignUp === tab.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Email
          </label>
          <input
            id="login-email"
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-slate-300/50 bg-slate-50/50 backdrop-blur px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 dark:border-slate-600/50 dark:bg-slate-800/50 dark:backdrop-blur dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-brand-400 dark:focus:ring-brand-400/30"
            placeholder="your@email.com"
            autoComplete="email"
          />
          {!isSignUp && email.trim() && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Onthouden — alleen je wachtwoord is nog nodig.
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-slate-300/50 bg-slate-50/50 backdrop-blur px-4 py-3 pr-12 text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 dark:border-slate-600/50 dark:bg-slate-800/50 dark:backdrop-blur dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/30"
              placeholder={isSignUp ? "Min. 6 characters" : "••••••••"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={busy}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              )}
            </button>
          </div>
          {isSignUp && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Must be at least 6 characters.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200/50 bg-red-50/50 backdrop-blur p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:backdrop-blur dark:text-red-200">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-lg border border-green-200/50 bg-green-50/50 backdrop-blur p-4 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-950/30 dark:backdrop-blur dark:text-green-200">
            {successMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 font-medium text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:from-brand-700 hover:to-brand-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:from-brand-600 dark:to-brand-700"
        >
          {busy ? (
            <>
              <Icons.Spinner className="h-4 w-4" />
              {isSignUp ? "Creating account..." : "Signing in..."}
            </>
          ) : isSignUp ? (
            "Create Account"
          ) : (
            "Sign In"
          )}
        </button>

        {!isSignUp && canQuickSignIn && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Je e-mailadres is onthouden — één klik of Enter volstaat.
          </p>
        )}
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => switchMode(!isSignUp)}
          disabled={busy}
          className="text-sm font-medium transition-all duration-200 text-brand-600 hover:text-brand-700 hover:underline underline-offset-2 disabled:opacity-50 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      </div>

      {/* Single-click access for prospects: straight into the demo account. */}
      <a
        href="/demo"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-500/40 bg-brand-500/5 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-500/10 dark:text-brand-300"
      >
        <Icons.Sparkles className="h-4 w-4" />
        Liever eerst kijken? Open de live demo
      </a>
    </div>
  );
}
