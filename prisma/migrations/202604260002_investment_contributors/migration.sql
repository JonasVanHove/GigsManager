-- Track musician contributors for investments
CREATE TABLE "InvestmentContributor" (
  "id" TEXT NOT NULL,
  "investmentId" TEXT NOT NULL,
  "bandMemberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvestmentContributor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentContributor_investmentId_bandMemberId_key"
  ON "InvestmentContributor"("investmentId", "bandMemberId");

CREATE INDEX "InvestmentContributor_investmentId_idx"
  ON "InvestmentContributor"("investmentId");

CREATE INDEX "InvestmentContributor_bandMemberId_idx"
  ON "InvestmentContributor"("bandMemberId");

ALTER TABLE "InvestmentContributor"
  ADD CONSTRAINT "InvestmentContributor_investmentId_fkey"
  FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentContributor"
  ADD CONSTRAINT "InvestmentContributor_bandMemberId_fkey"
  FOREIGN KEY ("bandMemberId") REFERENCES "BandMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;