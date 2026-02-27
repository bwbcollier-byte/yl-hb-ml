-- Music artist profiles table
CREATE TABLE IF NOT EXISTS music_artist_profiles (
  id BIGSERIAL PRIMARY KEY,
  spotify_artist_id TEXT UNIQUE NOT NULL,
  artist_name TEXT NOT NULL,
  genres TEXT,
  top_tracks TEXT,
  popularity INTEGER,
  image_url TEXT,
  external_urls JSONB,
  bio TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'error')),
  last_checked TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Music albums table
CREATE TABLE IF NOT EXISTS music_albums (
  id BIGSERIAL PRIMARY KEY,
  spotify_album_id TEXT UNIQUE NOT NULL,
  spotify_artist_id TEXT NOT NULL REFERENCES music_artist_profiles(spotify_artist_id) ON DELETE CASCADE,
  album_name TEXT NOT NULL,
  release_date TEXT,
  total_tracks INTEGER,
  image_url TEXT,
  external_urls JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Music concerts table
CREATE TABLE IF NOT EXISTS music_concerts (
  id TEXT PRIMARY KEY,
  spotify_artist_id TEXT NOT NULL REFERENCES music_artist_profiles(spotify_artist_id) ON DELETE CASCADE,
  concert_name TEXT NOT NULL,
  venue TEXT,
  date TIMESTAMP WITH TIME ZONE,
  location TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enrichment tracking metadata
CREATE TABLE IF NOT EXISTS enrichment_tracking (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_spotify_check TIMESTAMP WITH TIME ZONE,
  spotify_artists_checked INTEGER DEFAULT 0,
  spotify_artists_completed INTEGER DEFAULT 0,
  last_adb_check TIMESTAMP WITH TIME ZONE,
  adb_artists_enriched INTEGER DEFAULT 0,
  last_musicbrainz_check TIMESTAMP WITH TIME ZONE,
  musicbrainz_artists_enriched INTEGER DEFAULT 0,
  checked_ids TEXT,
  checked_urls TEXT,
  albums_processed INTEGER DEFAULT 0,
  concerts_processed INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_music_artist_profiles_status ON music_artist_profiles(status);
CREATE INDEX IF NOT EXISTS idx_music_artist_profiles_created_at ON music_artist_profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_music_albums_artist_id ON music_albums(spotify_artist_id);
CREATE INDEX IF NOT EXISTS idx_music_concerts_artist_id ON music_concerts(spotify_artist_id);

-- Insert initial tracking record
INSERT INTO enrichment_tracking (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
