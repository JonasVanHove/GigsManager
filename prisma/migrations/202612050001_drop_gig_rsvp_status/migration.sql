-- v1.41.0: drop RSVP / attendance.
--
-- Attendance is now implicit — a band member linked to a gig is playing it — so
-- the status column and its index only served removed UI. The historical
-- migration that added them (202610030001_gig_rsvp_status) is left in place;
-- migrations are history and must not be rewritten.
DROP INDEX IF EXISTS "GigBandMember_gigId_rsvpStatus_idx";

ALTER TABLE "GigBandMember" DROP COLUMN IF EXISTS "rsvpStatus";