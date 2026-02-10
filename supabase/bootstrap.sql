-- ============================================================================
-- GigManager — Supabase SQL Bootstrap
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

-- ── Indexes for performance ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Gig_userId_idx"         ON "Gig" ("userId");
CREATE INDEX IF NOT EXISTS "Gig_date_idx"            ON "Gig" ("date");
CREATE INDEX IF NOT EXISTS "Gig_paymentReceived_idx" ON "Gig" ("paymentReceived");
CREATE INDEX IF NOT EXISTS "Gig_bandPaid_idx"        ON "Gig" ("bandPaid");

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
-- Done! Your database is ready for GigManager.
-- ============================================================================
