-- iCal subscription feed token (v1.36.0).
-- The token is stored as a SHA-256 hash; the plaintext is shown once, when it
-- is generated, and is unrecoverable afterwards.

ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;
ALTER TABLE "User" ADD COLUMN "calendarTokenCreatedAt" TIMESTAMP(3);

-- Unique, but only across rows that actually have a token: Postgres treats
-- NULLs as distinct, so users without a feed are unaffected.
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
