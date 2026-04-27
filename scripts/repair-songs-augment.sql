-- Idempotent migration: add bands, tags, song_tags, song_bands, and soft-delete columns
BEGIN;

-- Bands table
CREATE TABLE IF NOT EXISTS bands (
  id text PRIMARY KEY,
  name text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id text PRIMARY KEY,
  name text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now()
);

-- Song -> Tag join
CREATE TABLE IF NOT EXISTS song_tags (
  id text PRIMARY KEY,
  "songId" text NOT NULL,
  "tagId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now()
);

-- Song -> Band join
CREATE TABLE IF NOT EXISTS song_bands (
  id text PRIMARY KEY,
  "songId" text NOT NULL,
  "bandId" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now()
);

-- Add deletedAt to songs and song_attachments if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='songs' AND column_name='deletedAt') THEN
    ALTER TABLE songs ADD COLUMN "deletedAt" timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='song_attachments' AND column_name='deletedAt') THEN
    ALTER TABLE song_attachments ADD COLUMN "deletedAt" timestamptz;
  END IF;
END$$;

COMMIT;
