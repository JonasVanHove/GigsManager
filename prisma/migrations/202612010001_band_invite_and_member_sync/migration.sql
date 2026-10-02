-- Bandmate account sync + band invite codes.
--
-- Hand-written on purpose: this database was originally created with
-- `prisma db push`, so `prisma migrate dev` cannot replay the history from
-- scratch (it dies on an early migration that depends on pre-existing tables).
-- The project therefore uses `db:migrate:repair` + `db:migrate:deploy`.

-- Gig: owner-controlled switch to hide the financial terms from bandmates.
-- Existing rows default to false, i.e. visible: sharing is the norm and hiding
-- is the explicit opt-out.
ALTER TABLE "Gig" ADD COLUMN "isFinancialHidden" BOOLEAN NOT NULL DEFAULT false;

-- BandMember.userId becomes nullable so a member can exist as an unclaimed
-- invitation until somebody registers with that email address.
-- DROP NOT NULL only widens the column; no existing row is affected.
ALTER TABLE "BandMember" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "BandMember" ADD COLUMN "isLeader" BOOLEAN NOT NULL DEFAULT false;

-- Claiming an invitation looks a member up by email.
CREATE INDEX "BandMember_email_idx" ON "BandMember"("email");

-- Band invite codes. All existing rows get NULL, and Postgres treats NULLs as
-- distinct, so the unique index cannot collide with current data.
ALTER TABLE "bands" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "bands" ADD COLUMN "canMembersEdit" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "bands_inviteCode_key" ON "bands"("inviteCode");