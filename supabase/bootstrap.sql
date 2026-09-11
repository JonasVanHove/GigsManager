-- ============================================================================
-- GigsManager — Supabase SQL Bootstrap
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- This creates the same schema that Prisma migrations would create.
-- Only needed if you prefer manual SQL over `npx prisma migrate deploy`.
-- ============================================================================

-- ── Create the Gig table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Gig" (
    "id"                  TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "eventName"           TEXT         NOT NULL,
    "date"                TIMESTAMP(3) NOT NULL,
    "performers"          TEXT         NOT NULL,
    "numberOfMusicians"   INTEGER      NOT NULL,
    "performanceFee"      DOUBLE PRECISION NOT NULL,
    "technicalFee"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "managerBonusType"    TEXT         NOT NULL DEFAULT 'fixed',
    "managerBonusAmount"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentReceived"     BOOLEAN      NOT NULL DEFAULT false,
    "paymentReceivedDate" TIMESTAMP(3),
    "bandPaid"            BOOLEAN      NOT NULL DEFAULT false,
    "bandPaidDate"        TIMESTAMP(3),
    "notes"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"              TEXT         NOT NULL,

    CONSTRAINT "Gig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Gig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- ── Create the User table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "User" (
    "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "supabaseId" TEXT         NOT NULL UNIQUE,
    "email"      TEXT         NOT NULL UNIQUE,
    "name"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- ── Create the UserSettings table ───────────────────────────────────────────

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

-- ── Idempotent column backfill ────────────────────────────────────────────────
-- `CREATE TABLE IF NOT EXISTS` cannot add columns to a table that was already
-- created by an older bootstrap, which left production Supabase missing newer
-- columns and made PUT /api/settings crash with Prisma P2022 ("column does not
-- exist") — surfacing as a 503 on Netlify. These guards are safe to re-run.
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customTab1" TEXT NOT NULL DEFAULT 'setlists';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customTab2" TEXT NOT NULL DEFAULT 'songs';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "overviewViewMode" TEXT NOT NULL DEFAULT 'grid';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfIncludeLogo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfFont" TEXT NOT NULL DEFAULT 'inter';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfPageSize" TEXT NOT NULL DEFAULT 'a4';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfPageBreakMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfDarkMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowHeaders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowMetadata" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfImagesOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfShowPageNumbers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pdfMarginSize" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "excludeSelfFromMemberCount" BOOLEAN NOT NULL DEFAULT false;

-- ── Indexes for performance ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Gig_userId_idx"         ON "Gig" ("userId");
CREATE INDEX IF NOT EXISTS "Gig_date_idx"            ON "Gig" ("date");
CREATE INDEX IF NOT EXISTS "Gig_paymentReceived_idx" ON "Gig" ("paymentReceived");
CREATE INDEX IF NOT EXISTS "Gig_bandPaid_idx"        ON "Gig" ("bandPaid");
CREATE INDEX IF NOT EXISTS "UserSettings_userId_idx" ON "UserSettings" ("userId");

-- ── Prisma migrations tracking table ────────────────────────────────────────
-- This tells Prisma that the initial migration has already been applied,
-- so `prisma migrate deploy` won't try to re-create the table.

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36)  NOT NULL,
    "checksum"            VARCHAR(64)  NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER      NOT NULL DEFAULT 0,

    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

-- ── Auto-update updatedAt on row change ─────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gig_updated_at ON "Gig";
CREATE TRIGGER gig_updated_at
    BEFORE UPDATE ON "Gig"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS user_updated_at ON "User";
CREATE TRIGGER user_updated_at
    BEFORE UPDATE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS usersettings_updated_at ON "UserSettings";
CREATE TRIGGER usersettings_updated_at
    BEFORE UPDATE ON "UserSettings"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ── Optional: seed demo data ────────────────────────────────────────────────
-- Uncomment the block below if you want to insert sample gigs.

/*
INSERT INTO "Gig" ("id", "eventName", "date", "performers", "numberOfMusicians",
    "performanceFee", "technicalFee", "managerBonusType", "managerBonusAmount",
    "paymentReceived", "paymentReceivedDate", "bandPaid", "bandPaidDate", "notes",
    "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'Jazz at the Park',
     '2026-01-15 19:00:00', 'The Jazz Quartet', 4,
     2000, 300, 'percentage', 10,
     true, '2026-01-20 00:00:00', true, '2026-01-22 00:00:00',
     'Great venue — book again next year',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    (gen_random_uuid()::text, 'Corporate Awards Night',
     '2026-02-01 20:00:00', 'Smooth Ensemble', 5,
     3500, 500, 'fixed', 200,
     true, '2026-02-05 00:00:00', false, NULL,
     'Still need to pay band members',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    (gen_random_uuid()::text, 'Summer Wedding — De Smet',
     '2026-03-15 16:00:00', 'The Groove Band', 3,
     1500, 0, 'fixed', 100,
     false, NULL, false, NULL,
     NULL,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    (gen_random_uuid()::text, 'Blues Bar Friday',
     '2026-02-08 21:00:00', 'Jonas & The Blues', 2,
     800, 150, 'percentage', 5,
     true, '2026-02-09 00:00:00', true, '2026-02-09 00:00:00',
     NULL,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
*/

-- ============================================================================
-- Done! Your database is ready for GigsManager.
-- ============================================================================
