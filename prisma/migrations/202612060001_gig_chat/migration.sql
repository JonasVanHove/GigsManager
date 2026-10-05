-- CreateTable
CREATE TABLE "GigMessage" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GigMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GigChatRead" (
    "gigId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GigChatRead_pkey" PRIMARY KEY ("gigId","userId")
);

-- CreateIndex
CREATE INDEX "GigMessage_gigId_createdAt_idx" ON "GigMessage"("gigId", "createdAt");

-- CreateIndex
CREATE INDEX "GigMessage_authorId_idx" ON "GigMessage"("authorId");

-- CreateIndex
CREATE INDEX "GigChatRead_userId_idx" ON "GigChatRead"("userId");

-- AddForeignKey
ALTER TABLE "GigMessage" ADD CONSTRAINT "GigMessage_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GigMessage" ADD CONSTRAINT "GigMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "BandMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GigChatRead" ADD CONSTRAINT "GigChatRead_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
