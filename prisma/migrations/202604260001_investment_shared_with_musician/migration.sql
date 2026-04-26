-- Track whether an investment is split with a musician
ALTER TABLE "Investment"
  ADD COLUMN "sharedWithMusician" BOOLEAN NOT NULL DEFAULT false;