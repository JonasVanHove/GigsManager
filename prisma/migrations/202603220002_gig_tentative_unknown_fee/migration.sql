-- AlterTable
ALTER TABLE "Gig"
ADD COLUMN "isTentative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "performanceFeeUnknown" BOOLEAN NOT NULL DEFAULT false;
