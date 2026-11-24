#!/usr/bin/env node
/**
 * Applies pending Prisma migrations and survives a Supabase project that is
 * paused or waking up.
 *
 * Why this wrapper exists
 * -----------------------
 * A paused Supabase project drops its tenant from Supavisor, so the migration
 * connection fails with:
 *
 *   FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found
 *
 * `npx prisma migrate deploy` treats that as a hard error, which used to fail the
 * whole Netlify build before Next.js even started. This wrapper:
 *
 *  1. retries *connectivity* failures with a growing backoff, because a restored
 *     project needs a couple of minutes before it accepts connections again;
 *  2. wakes the project between attempts with a real PostgREST query and, when
 *     SUPABASE_ACCESS_TOKEN is present, restores it through the Supabase
 *     Management API;
 *  3. fails immediately on real migration problems (bad SQL, checksum drift,
 *     constraint violations) so schema drift can never slip into a deploy.
 *
 * Environment:
 *   DIRECT_URL                 required — prisma.config.ts reads it for the CLI
 *   NEXT_PUBLIC_SUPABASE_URL   optional — used to wake the project
 *   SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *                              optional — API key for that wake-up query
 *   SUPABASE_ACCESS_TOKEN      optional — Management API token, restores a paused project
 *   DB_MIGRATE_ATTEMPTS        optional — number of attempts, default 6
 */

import { spawnSync } from "node:child_process";

const ATTEMPTS = Number.parseInt(process.env.DB_MIGRATE_ATTEMPTS ?? "6", 10) || 6;
const BACKOFF_SECONDS = [15, 30, 45, 60, 90];

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_API_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

// Connection-level failures a wake-up + retry can resolve. Everything else is a
// real migration error and must fail the build.
const RETRYABLE_PATTERNS = [
  /tenant\/user .* not found/i,
  /P1000/, // authentication failed (project still starting up)
  /P1001/, // can't reach database server
  /P1002/, // database server timed out
  /P1017/, // server has closed the connection
  /ENOTFOUND/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /connection terminated/i,
  /database system is starting up/i,
  /57P03/, // cannot_connect_now
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  console.log(`[migrate] ${message}`);
}

/** Prints a connection string without its password, e.g. postgres.ref@host:5432/postgres. */
function describeConnection(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.username}@${parsed.host}${parsed.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

function projectRef() {
  return SUPABASE_URL.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1] ?? null;
}

async function httpStatus(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    return response.status;
  } catch (error) {
    log(`request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/** Runs one real query so the project registers activity (and un-pauses). */
async function wakeProject() {
  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    log("no Supabase API key configured — cannot wake the project from here");
    return false;
  }

  const status = await httpStatus(`${SUPABASE_URL}/rest/v1/bands?select=id&limit=1`, {
    headers: { apikey: SUPABASE_API_KEY, Authorization: `Bearer ${SUPABASE_API_KEY}` },
  });
  log(`PostgREST wake-up query -> HTTP ${status}`);
  return status === 200 || status === 206;
}

/** Restores a paused project through the Management API and waits for it to answer. */
async function restoreProject() {
  const ref = projectRef();
  if (!ref || !SUPABASE_ACCESS_TOKEN) {
    return false;
  }

  log(`requesting a restore of Supabase project ${ref}`);
  const status = await httpStatus(`https://api.supabase.com/v1/projects/${ref}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  });
  log(`restore request -> HTTP ${status}`);
  if (status !== 200) {
    return false;
  }

  // Restores are asynchronous: poll until the API answers queries again.
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    if (await wakeProject()) {
      log("project restored");
      return true;
    }
    await sleep(15_000);
  }
  return false;
}

function runMigrateDeploy() {
  // `shell: true` keeps this working on Windows (where npx is a .cmd shim) and
  // on the Netlify build image alike; the command is a fixed string.
  const result = spawnSync("npx prisma migrate deploy", {
    encoding: "utf8",
    env: process.env,
    shell: true,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
  if (output.trim()) {
    console.log(output.trim());
  }
  return { ok: result.status === 0, output };
}

async function main() {
  if (!process.env.DIRECT_URL) {
    // prisma.config.ts resolves env("DIRECT_URL") for the CLI; without it Prisma
    // fails with a confusing "Cannot resolve environment variable" message.
    console.error("[migrate] DIRECT_URL is not set — prisma migrate deploy cannot run.");
    process.exit(1);
  }

  log(`target: ${describeConnection(process.env.DIRECT_URL)}`);
  log(`attempts: ${ATTEMPTS} (DB_MIGRATE_ATTEMPTS)`);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    log(`prisma migrate deploy — attempt ${attempt}/${ATTEMPTS}`);
    const { ok, output } = runMigrateDeploy();

    if (ok) {
      log("database schema is up to date");
      return;
    }

    if (!RETRYABLE_PATTERNS.some((pattern) => pattern.test(output))) {
      console.error("[migrate] migration failed for a non-connectivity reason — not retrying.");
      process.exit(1);
    }

    if (attempt === ATTEMPTS) {
      break;
    }

    const waitSeconds = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)];
    log(`connection failure (retryable) — waking Supabase, retrying in ${waitSeconds}s`);
    if (!(await wakeProject())) {
      await restoreProject();
    }
    await sleep(waitSeconds * 1000);
  }

  console.error(`[migrate] database still unreachable after ${ATTEMPTS} attempts.`);
  console.error("  • Supabase pauses Free-plan projects after a week without database activity.");
  console.error("  • Restore it from the Supabase dashboard, or set SUPABASE_ACCESS_TOKEN so");
  console.error("    this build can restore it automatically.");
  process.exit(1);
}

await main();
