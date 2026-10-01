-- AlterTable
ALTER TABLE "Gig"
  ADD COLUMN     "aiSchedule" TEXT,
  ADD COLUMN     "aiScheduleAt" TIMESTAMP(3),
  ADD COLUMN     "venueName" TEXT,
  ADD COLUMN     "venueLocation" TEXT,
  ADD COLUMN     "soundcheckTime" TEXT,
  ADD COLUMN     "doorsOpenTime" TEXT,
  ADD COLUMN     "performanceDurationMinutes" INTEGER,
  ADD COLUMN     "gearSetupNotes" TEXT,
  ADD COLUMN     "organizerName" TEXT,
  ADD COLUMN     "organizerEmail" TEXT,
  ADD COLUMN     "organizerPhone" TEXT;
