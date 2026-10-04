-- Gig-level cost accounting (v1.40.0).
--
-- Every expense column is NOT NULL DEFAULT 0 so existing gigs are unaffected.
-- `totalFeeOverride` is nullable on purpose: NULL means "gross is
-- performanceFee + technicalFee", which is how every pre-v1.40.0 gig behaves.
ALTER TABLE "Gig"
  ADD COLUMN "paExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "travelExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "otherExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "totalFeeOverride" DOUBLE PRECISION;

-- Per-member payout participation and fixed-amount override.
ALTER TABLE "GigBandMember"
  ADD COLUMN "payoutIncluded" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "customPayoutAmount" DOUBLE PRECISION;