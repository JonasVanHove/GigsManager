ALTER TABLE "Investment"
  ADD COLUMN IF NOT EXISTS "sharedWithMusician" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "InvestmentContributor" (
  "id" TEXT NOT NULL,
  "investmentId" TEXT NOT NULL,
  "bandMemberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvestmentContributor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvestmentContributor_investmentId_bandMemberId_key"
  ON "InvestmentContributor"("investmentId", "bandMemberId");

CREATE INDEX IF NOT EXISTS "InvestmentContributor_investmentId_idx"
  ON "InvestmentContributor"("investmentId");

CREATE INDEX IF NOT EXISTS "InvestmentContributor_bandMemberId_idx"
  ON "InvestmentContributor"("bandMemberId");
