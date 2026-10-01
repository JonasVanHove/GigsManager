-- AlterTable
ALTER TABLE "Gig"
  ADD COLUMN "aiSummary" TEXT,
  ADD COLUMN "aiSummaryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GigAttachment" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "extractedText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GigAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GigAttachment_gigId_order_idx" ON "GigAttachment"("gigId", "order");

-- AddForeignKey
ALTER TABLE "GigAttachment" ADD CONSTRAINT "GigAttachment_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;