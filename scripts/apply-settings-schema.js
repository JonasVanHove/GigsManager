#!/usr/bin/env node
/**
 * apply-settings-schema.js
 *
 * Heals the Supabase `UserSettings` table so Prisma P2022 ("column does not
 * exist") errors on PUT /api/settings can never happen again.
 *
 * It is the operational companion to the automatic drift recovery in
 * src/app/api/settings/route.ts — run it once against the production database
 * after deploying, and the [SETTINGS_DB_DRIFT_WARNING] entries (if any) will
 * stop appearing:
 *
 *   node scripts/apply-settings-schema.js            # apply
 *   node scripts/apply-settings-schema.js --dry-run  # print SQL only
 *
 * Database URL resolution order:
 *   1. DIRECT_URL   (matches prisma.config.ts, preferred for DDL)
 *   2. DATABASE_URL
 *   3. CLI arg:     --url postgresql://...
 *
 * The statements are idempotent and identical to the guard already shipped in
 * supabase/bootstrap.sql. Every column added after the original UserSettings
 * schema is covered (customTab1/2, overviewViewMode, PDF export + band
 * settings), so both a brand-new table (CREATE TABLE IF NOT EXISTS) and a stale
 * pre-migration table (ALTER TABLE ... ADD COLUMN IF NOT EXISTS) end up with
 * the exact schema Prisma expects.
 */

require("dotenv").config();

const { Pool } = require("pg");

const isDryRun = process.argv.includes("--dry-run");
const urlArgIndex = process.argv.indexOf("--url");
const urlFromArg = urlArgIndex !== -1 ? process.argv[urlArgIndex + 1] : null;

/** Columns added to UserSettings after the original schema. Keep in sync with
 *  DRIFT_PRONE_SETTINGS_COLUMNS in src/app/api/settings/route.ts and with
 *  supabase/bootstrap.sql. */
const SETTINGS_COLUMNS = [
  { name: "theme", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT \'system\';' },
  { name: "customTab1", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customTab1" TEXT NOT NULL DEFAULT \'setlists\';' },
  { name: "customTab2", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customTab2" TEXT NOT NULL DEFAULT \'songs\';' },
  { name: "overviewViewMode", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "overviewViewMode" TEXT NOT NULL DEFAULT \'grid\';' },
  { name: "pdfIncludeLogo", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfIncludeLogo" BOOLEAN NOT NULL DEFAULT true;' },
  { name: "pdfFont", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfFont" TEXT NOT NULL DEFAULT \'inter\';' },
  { name: "pdfPageSize", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfPageSize" TEXT NOT NULL DEFAULT \'a4\';' },
  { name: "pdfPageBreakMode", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfPageBreakMode" TEXT NOT NULL DEFAULT \'auto\';' },
  { name: "pdfDarkMode", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfDarkMode" BOOLEAN NOT NULL DEFAULT false;' },
  { name: "pdfShowHeaders", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowHeaders" BOOLEAN NOT NULL DEFAULT true;' },
  { name: "pdfShowMetadata", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowMetadata" BOOLEAN NOT NULL DEFAULT true;' },
  { name: "pdfImagesOnly", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfImagesOnly" BOOLEAN NOT NULL DEFAULT false;' },
  { name: "pdfShowPageNumbers", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowPageNumbers" BOOLEAN NOT NULL DEFAULT true;' },
  { name: "pdfMarginSize", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfMarginSize" TEXT NOT NULL DEFAULT \'medium\';' },
  { name: "excludeSelfFromMemberCount", ddl: 'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "excludeSelfFromMemberCount" BOOLEAN NOT NULL DEFAULT false;' },
];

// Mirrors supabase/bootstrap.sql so the script also boots a missing table from
// scratch (instead of failing with "relation does not exist").
const CREATE_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "UserSettings" (
    "id"                    TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "currency"              TEXT         NOT NULL DEFAULT 'EUR',
    "claimPerformanceFee"   BOOLEAN      NOT NULL DEFAULT true,
    "claimTechnicalFee"     BOOLEAN      NOT NULL DEFAULT true,
    "userId"                TEXT         NOT NULL UNIQUE,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theme"                 TEXT         NOT NULL DEFAULT 'system',
    "customTab1"            TEXT         NOT NULL DEFAULT 'setlists',
    "customTab2"            TEXT         NOT NULL DEFAULT 'songs',
    "overviewViewMode"      TEXT         NOT NULL DEFAULT 'grid',
    "pdfIncludeLogo"        BOOLEAN      NOT NULL DEFAULT true,
    "pdfFont"               TEXT         NOT NULL DEFAULT 'inter',
    "pdfPageSize"           TEXT         NOT NULL DEFAULT 'a4',
    "pdfPageBreakMode"      TEXT         NOT NULL DEFAULT 'auto',
    "pdfDarkMode"           BOOLEAN      NOT NULL DEFAULT false,
    "pdfShowHeaders"        BOOLEAN      NOT NULL DEFAULT true,
    "pdfShowMetadata"       BOOLEAN      NOT NULL DEFAULT true,
    "pdfImagesOnly"         BOOLEAN      NOT NULL DEFAULT false,
    "pdfShowPageNumbers"    BOOLEAN      NOT NULL DEFAULT true,
    "pdfMarginSize"         TEXT         NOT NULL DEFAULT 'medium',
    "excludeSelfFromMemberCount" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
`.trim();

function resolveUrl() {
  if (urlFromArg && urlFromArg.trim()) return urlFromArg.trim();
  if (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) return process.env.DIRECT_URL.trim();
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) return process.env.DATABASE_URL.trim();
  return null;
}

function buildSql() {
  return [CREATE_TABLE_DDL, ...SETTINGS_COLUMNS.map((c) => c.ddl)].join("\n");
}

async function main() {
  const sql = buildSql();

  if (isDryRun) {
    console.log("── apply-settings-schema.js (dry run) ────────────────────────────");
    console.log(sql);
    console.log("──────────────────────────────────────────────────────────────────");
    console.log("No changes were executed (--dry-run).");
    return 0;
  }

  const url = resolveUrl();
  if (!url) {
    console.error(
      "❌ No database URL found. Set DIRECT_URL or DATABASE_URL (or pass --url <postgresql://...>)."
    );
    return 1;
  }

  const ssl = /sslmode=(require|no-verify)|sslcert=|host=.*supabase\.co/i.test(url)
    ? { rejectUnauthorized: false }
    : false;

  const pool = new Pool({
    connectionString: url,
    ssl,
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
  });

  try {
    const client = await pool.connect();

    // Report current drift before healing.
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'UserSettings'`
    );
    const existing = new Set(rows.map((r) => r.column_name));
    const missing = SETTINGS_COLUMNS.filter((c) => !existing.has(c.name)).map((c) => c.name);

    console.log(`📋 UserSettings table found with ${rows.length} column(s).`);
    if (missing.length === 0) {
      console.log("✅ Schema is up to date — no columns missing, nothing to do.");
      return 0;
    }
    console.log(`⚠️  Missing column(s): ${missing.join(", ")}`);
    console.log("   Applying idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS guards...");

    await client.query(sql);

    const { rows: after } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'UserSettings'`
    );
    const stillMissing = SETTINGS_COLUMNS.filter((c) => !after.some((r) => r.column_name === c.name)).map((c) => c.name);

    if (stillMissing.length === 0) {
      console.log("✅ Done. UserSettings now matches the Prisma schema.");
      console.log("   PUT /api/settings column drift (P2022) is resolved.");
      return 0;
    }
    console.error(`❌ Still missing after apply: ${stillMissing.join(", ")}`);
    return 1;
  } catch (err) {
    console.error("❌ Failed to apply settings schema:", err instanceof Error ? err.message : err);
    console.error("   If this was only a connection problem, you can apply manually:");
    console.error(sql);
    return 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().then((code) => process.exit(code));