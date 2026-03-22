-- Add auto-inclusion metadata for share links
ALTER TABLE "ShareLink"
  ADD COLUMN "selectionMode" TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN "includeArtists" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "autoIncludeNewGigs" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ShareLink_userId_selectionMode_idx"
  ON "ShareLink"("userId", "selectionMode");
