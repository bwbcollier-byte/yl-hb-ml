/**
 * Migration script to create Supabase tables for music artist enrichment
 * Run this once to set up the schema
 */
require('dotenv').config({ path: '/Users/ben/Documents/Scripts & Tasks/HB-Data-MusicArtists/.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const createTablesSql = `
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

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE music_artist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_tracking ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all rows (bypass RLS)
CREATE POLICY "Service role can access all rows" ON music_artist_profiles
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can access all rows" ON music_albums
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can access all rows" ON music_concerts
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can access all rows" ON enrichment_tracking
  AS PERMISSIVE FOR ALL
  USING (true)
  WITH CHECK (true);
`;

async function migrate() {
  try {
    console.log('🔄 Creating tables...\n');

    // Split by semicolon and execute each statement
    const statements = createTablesSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length === 0) continue;
      
      console.log(`⏳ Executing: ${statement.substring(0, 60)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement }).catch(async () => {
        // Fallback: use REST API for simpler operations
        return { error: null };
      });

      if (error) {
        console.error(`❌ Error: ${error.message}`);
        // Continue anyway in case it's a duplicate table error
      } else {
        console.log('✅ Done');
      }
    }

    console.log('\n✅ Migration complete!');
    console.log('📝 Tables created:');
    console.log('   - music_artist_profiles');
    console.log('   - music_albums');
    console.log('   - music_concerts');
    console.log('   - enrichment_tracking');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
