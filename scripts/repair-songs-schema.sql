-- Idempotent SQL to add songs and song_attachments tables if they don't exist
BEGIN;

-- Create songs table
CREATE TABLE IF NOT EXISTS songs (
  id text PRIMARY KEY,
  title text NOT NULL,
  notes text,
  date timestamptz NOT NULL DEFAULT now(),
  "userId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Create song_attachments table
CREATE TABLE IF NOT EXISTS song_attachments (
  id text PRIMARY KEY,
  "songId" text NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  content_type text NOT NULL,
  caption text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Foreign keys (add if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'songs' AND c.conname = 'songs_userid_fkey'
  ) THEN
    ALTER TABLE songs
      ADD CONSTRAINT songs_userid_fkey FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'song_attachments' AND c.conname = 'song_attachments_songid_fkey'
  ) THEN
    ALTER TABLE song_attachments
      ADD CONSTRAINT song_attachments_songid_fkey FOREIGN KEY ("songId") REFERENCES songs(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_songs_userid ON songs("userId");
CREATE INDEX IF NOT EXISTS idx_songs_date ON songs(date);
CREATE INDEX IF NOT EXISTS idx_song_attachments_songid ON song_attachments("songId");

COMMIT;
