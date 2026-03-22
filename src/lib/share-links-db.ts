import { prisma } from "@/lib/prisma";

let ensured = false;
let ensureInFlight: Promise<void> | null = null;

async function runEnsure() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ShareLink"
      ADD COLUMN IF NOT EXISTS "selectionMode" TEXT NOT NULL DEFAULT 'individual',
      ADD COLUMN IF NOT EXISTS "includeArtists" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS "autoIncludeNewGigs" BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ShareLink_userId_selectionMode_idx"
      ON "ShareLink"("userId", "selectionMode");
  `);
}

export async function ensureShareLinksSchema() {
  if (ensured) return;

  if (!ensureInFlight) {
    ensureInFlight = runEnsure()
      .then(() => {
        ensured = true;
      })
      .finally(() => {
        ensureInFlight = null;
      });
  }

  await ensureInFlight;
}
