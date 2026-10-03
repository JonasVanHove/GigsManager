-- Add RSVP / attendance status to GigBandMember.
-- Default is 'PENDING' so existing rows are unaffected.

ALTER TABLE "GigBandMember" ADD COLUMN "rsvpStatus" TEXT NOT NULL DEFAULT 'PENDING';

-- Index speeds up the attendance summary badge on gig cards.
CREATE INDEX "GigBandMember_gigId_rsvpStatus_idx" ON "GigBandMember"("gigId", "rsvpStatus");
