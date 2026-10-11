// --- Runtime environment validation ------------------------------------------
// Single, type-safe place to read and validate environment variables.
//
// This module is SERVER-ONLY. Never import it from a "use client" component or
// any client-reachable code path: it can read server-only secrets and must not
// be bundled into the browser.
//
// Design notes:
//  * Validation is LAZY. Nothing throws at import time, so `next build` (which
//    imports many modules without a live database) never fails on a missing
//    DATABASE_URL. Call `serverEnv()` or `assertRequiredEnv()` at runtime where
//    the value is actually needed.
//  * NEXT_PUBLIC_* variables are inlined into the client bundle by Next.js and
//    are therefore PUBLIC by definition. Real secrets (service role, Resend,
//    Groq, webhook signing) must NEVER carry that prefix.

type EnvLookup = Record<string, string | undefined>;

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

const OPTIONAL_KEYS = [
  "DIRECT_URL",
  "GROQ_API_KEY",
  "RESEND_API_KEY",
  "SUPABASE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_DEMO_EMAIL",
  "NEXT_PUBLIC_DEMO_PASSWORD",
  "NEXT_PUBLIC_DEMO_ENABLED",
  "NODE_ENV",
] as const;

export interface ServerEnv {
  /** Pooled connection used by the app at runtime (port 6543, pgbouncer). */
  DATABASE_URL: string;
  /** Direct connection used by `prisma migrate` (port 5432). */
  DIRECT_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  /** Server-only: verifies Supabase JWTs and manages auth users. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Absolute deployed origin, no trailing slash. Used for invite/QR links. */
  NEXT_PUBLIC_APP_URL: string;
  /** Optional. Absent ⇒ AI endpoints return 503, the rest of the app works. */
  GROQ_API_KEY: string;
  /** Optional. Absent ⇒ auth e-mails are logged but not sent. */
  RESEND_API_KEY: string;
  /** Optional. HMAC secret for the Supabase auth webhook. */
  SUPABASE_WEBHOOK_SECRET: string;
  /** Optional public demo account settings. */
  NEXT_PUBLIC_DEMO_EMAIL: string;
  NEXT_PUBLIC_DEMO_PASSWORD: string;
  NEXT_PUBLIC_DEMO_ENABLED: string;
  NODE_ENV: string;
}

const runningInProd = (source: EnvLookup = process.env): boolean =>
  source.NODE_ENV === "production";

/**
 * Collect every missing required variable. The service role key and public app
 * URL are only strictly required in production; locally a developer can run the
 * app without mail/QR links and without the admin key (auth falls back to a
 * graceful stub), so we keep local DX frictionless while failing fast on a
 * production deploy that would silently break those features.
 */
export function missingEnvKeys(source: EnvLookup = process.env): string[] {
  const missing: string[] = [];
  const check = (key: string, prodOnly: boolean) => {
    if (source[key]) return;
    if (prodOnly && !runningInProd(source)) return;
    missing.push(key);
  };
  check("DATABASE_URL", false);
  check("NEXT_PUBLIC_SUPABASE_URL", false);
  check("NEXT_PUBLIC_SUPABASE_ANON_KEY", false);
  check("SUPABASE_SERVICE_ROLE_KEY", true);
  check("NEXT_PUBLIC_APP_URL", true);
  return missing;
}

/**
 * Throw a descriptive error listing every missing variable. Call from a route
 * handler, cron, or an explicit startup guard — never at module top level.
 */
export function assertRequiredEnv(source: EnvLookup = process.env): void {
  const missing = missingEnvKeys(source);
  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variable(s): ${missing.join(", ")}\n` +
        "   → Copy .env.example to .env (locally) or set them in your host's " +
        "environment settings (Vercel/Netlify)."
    );
  }
}

/**
 * Read and validate the full server environment. Throws if a required variable
 * is missing, so call it lazily where the value is used, not at import time.
 */
export function serverEnv(source: EnvLookup = process.env): ServerEnv {
  assertRequiredEnv(source);
  const req = (key: string): string => source[key] as string;
  const opt = (key: string, fallback = ""): string => source[key] ?? fallback;
  return {
    DATABASE_URL: req("DATABASE_URL"),
    DIRECT_URL: opt("DIRECT_URL"),
    NEXT_PUBLIC_SUPABASE_URL: req("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: req("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: req("SUPABASE_SERVICE_ROLE_KEY"),
    NEXT_PUBLIC_APP_URL: req("NEXT_PUBLIC_APP_URL"),
    GROQ_API_KEY: opt("GROQ_API_KEY"),
    RESEND_API_KEY: opt("RESEND_API_KEY"),
    SUPABASE_WEBHOOK_SECRET: opt("SUPABASE_WEBHOOK_SECRET"),
    NEXT_PUBLIC_DEMO_EMAIL: opt("NEXT_PUBLIC_DEMO_EMAIL", "demo@gigsmanager.app"),
    NEXT_PUBLIC_DEMO_PASSWORD: opt("NEXT_PUBLIC_DEMO_PASSWORD"),
    NEXT_PUBLIC_DEMO_ENABLED: opt("NEXT_PUBLIC_DEMO_ENABLED", "true"),
    NODE_ENV: opt("NODE_ENV", "development"),
  };
}

/** Full inventory of recognised keys, for docs/tests. */
export const ENV_KEYS = {
  required: REQUIRED_KEYS,
  optional: OPTIONAL_KEYS,
} as const;

// Kept for backwards compatibility with existing imports (isDev/isProd). These
// no longer validate DATABASE_URL at import time.
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const isDev = NODE_ENV === "development";
export const isProd = NODE_ENV === "production";

