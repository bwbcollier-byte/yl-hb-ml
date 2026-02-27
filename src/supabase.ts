import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================================================
// SPOTIFY FUNCTIONS
// ============================================================================

/**
 * Upsert a music artist profile to talent_profiles table
 */
export async function upsertArtistProfile(profileData: {
  spotify_id: string;
  name?: string;
  sp_genres?: string;
  sp_popularity?: string | number;
  sp_followers?: string | number;
  sp_listeners?: string | number;
  sp_image?: string;
  sp_about?: string;
  sp_check?: string;
  sp_data_status?: string;
  [key: string]: any;
}) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .upsert(profileData, { onConflict: 'spotify_id' });

  if (error) {
    throw new Error(`Failed to upsert artist profile: ${error.message}`);
  }

  return data;
}

/**
 * Get artist profile by Spotify ID
 */
export async function getArtistProfile(spotifyId: string) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .select('*')
    .eq('spotify_id', spotifyId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch artist profile: ${error.message}`);
  }

  return data || null;
}

/**
 * Get all artists for Spotify enrichment
 * Filters for artists that have not been processed yet (sp_check IS NULL)
 */
export async function getPendingArtists(limit?: number) {
  try {
    console.log('⏳ Fetching artists for Spotify enrichment from Supabase...');

    let query = supabase
      .from('talent_profiles')
      .select('spotify_id, name')
      .not('spotify_id', 'is', null)
      .is('sp_check', null);

    if (limit) {
      query = query.limit(limit);
    } else {
      // Default safety limit if not specified, but much larger than 5
      query = query.limit(1000);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch pending artists: ${error.message}`);
    }

    const artists = data?.map(row => ({
      id: row.spotify_id,
      spotify_id: row.spotify_id,
      name: row.name,
    })) || [];

    console.log(`✅ Found ${artists.length} pending artists to process`);
    return artists;
  } catch (err: any) {
    console.error('⚠️ Query error:', err.message);
    return [];
  }
}

/**
 * Update artist profile Spotify check status
 */
export async function updateArtistSpotifyStatus(
  spotifyId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'error',
  updates?: Record<string, any>
) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .update({
      sp_check: status,
      sp_check_updates: new Date().toISOString(),
      ...updates,
    })
    .eq('spotify_id', spotifyId);

  if (error) {
    throw new Error(`Failed to update artist status: ${error.message}`);
  }

  return data;
}

/**
 * Update artist profile with Spotify data
 */
export async function updateArtistSpotifyData(
  spotifyId: string,
  spotifyData: Record<string, any>
) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .update({
      ...spotifyData,
      updated_at: new Date().toISOString(),
    })
    .eq('spotify_id', spotifyId);

  if (error) {
    throw new Error(`Failed to update artist Spotify data: ${error.message}`);
  }

  return data;
}

/**
 * Get tracking metadata
 */
export async function getTrackingMetadata() {
  return {
    last_check: new Date().toISOString(),
  };
}

/**
 * Update artist album counts
 */
export async function updateArtistAlbumCounts(
  spotifyId: string,
  counts: {
    sp_albums_count?: string | number;
    sp_popular_albums_count?: string | number;
    sp_singles_count?: string | number;
    sp_compilations_count?: string | number;
  }
) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .update({
      ...counts,
      updated_at: new Date().toISOString(),
    })
    .eq('spotify_id', spotifyId);

  if (error) {
    throw new Error(`Failed to update album counts: ${error.message}`);
  }

  return data;
}

/**
 * Update concert count
 */
export async function updateArtistConcertCount(spotifyId: string, count: string | number) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .update({
      sp_concerts_count: count,
      updated_at: new Date().toISOString(),
    })
    .eq('spotify_id', spotifyId);

  if (error) {
    throw new Error(`Failed to update concert count: ${error.message}`);
  }

  return data;
}

// ============================================================================
// ALBUM FUNCTIONS
// ============================================================================

/**
 * Check if album exists in media_profiles by spotify_album_id
 */
export async function getAlbumBySpotifyId(spotifyAlbumId: string) {
  const { data, error } = await supabase
    .from('media_profiles')
    .select('*')
    .eq('spotify_album_id', spotifyAlbumId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check album: ${error.message}`);
  }

  return data || null;
}

/**
 * Create or update album in media_profiles
 */
export async function upsertAlbum(albumData: {
  spotify_album_id: string;
  album_name: string;
  spotify_artist_id: string;
  spotify_artist_name?: string;
  talent_profile_id?: string;
  spotify_type?: string;
  cover_art_url?: string;
  release_date?: string;
  release_year?: string;
  track_count?: string;
  label?: string;
  [key: string]: any;
}) {
  const { data, error } = await supabase
    .from('media_profiles')
    .upsert({
      spotify_album_id: albumData.spotify_album_id,
      album_name: albumData.album_name,
      spotify_artist_id: albumData.spotify_artist_id,
      spotify_artist_name: albumData.spotify_artist_name,
      talent_profile_id: albumData.talent_profile_id,
      spotify_type: albumData.spotify_type,
      cover_art_url: albumData.cover_art_url,
      spotify_album_url: `https://open.spotify.com/album/${albumData.spotify_album_id}`,
      release_date: albumData.release_date,
      release_year: albumData.release_year,
      track_count: albumData.track_count,
      label: albumData.label,
      status: 'Updated',
      sp_check: 'completed',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'spotify_album_id',
    });

  if (error) {
    throw new Error(`Failed to upsert album: ${error.message}`);
  }

  return data;
}

/**
 * Get all albums for an artist from media_profiles (by spotify_artist_id or artist name)
 */
export async function getAlbumsByArtistId(spotifyArtistId: string) {
  const { data, error } = await supabase
    .from('media_profiles')
    .select('*')
    .eq('spotify_artist_id', spotifyArtistId);

  if (error) {
    throw new Error(`Failed to fetch albums for artist ${spotifyArtistId}: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a media_profiles row with MusicBrainz data
 */
export async function updateAlbumMusicBrainzData(
  spotifyAlbumId: string,
  mbFields: Record<string, any>
) {
  const { data, error } = await supabase
    .from('media_profiles')
    .update({
      ...mbFields,
      updated_at: new Date().toISOString(),
    })
    .eq('spotify_album_id', spotifyAlbumId);

  if (error) {
    throw new Error(`Failed to update album MB data for ${spotifyAlbumId}: ${error.message}`);
  }

  return data;
}

// ============================================================================
// RELATED ARTIST FUNCTIONS
// ============================================================================

/**
 * Check if artist exists in talent_profiles by spotify_id
 */
export async function getRelatedArtistBySpotifyId(spotifyId: string) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .select('id, spotify_id, name')
    .eq('spotify_id', spotifyId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check related artist: ${error.message}`);
  }

  return data || null;
}

/**
 * Create new related artist in talent_profiles if doesn't exist
 */
export async function createRelatedArtist(artistData: {
  spotify_id: string;
  name: string;
  sp_type?: string;
  sp_avatar_image_urls?: string;
  sp_image?: string;
  sp_data_status?: string;
  sp_artist_id?: string;
  [key: string]: any;
}) {
  // Check if already exists
  const existing = await getRelatedArtistBySpotifyId(artistData.spotify_id);
  if (existing) {
    return existing;
  }

  // Create new artist
  const { data, error } = await supabase
    .from('talent_profiles')
    .insert({
      spotify_id: artistData.spotify_id,
      name: artistData.name,
      sp_type: artistData.sp_type || 'Artist',
      sp_avatar_image_urls: artistData.sp_avatar_image_urls,
      sp_image: artistData.sp_image,
      sp_data_status: artistData.sp_data_status || 'Todo',
      sp_artist_id: artistData.sp_artist_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create related artist: ${error.message}`);
  }

  return data?.[0] || null;
}

// ============================================================================
// CONCERT/EVENT FUNCTIONS
// ============================================================================

/**
 * Check if concert exists in event_profiles by spotify_id
 */
export async function getEventBySpotifyId(spotifyId: string) {
  const { data, error } = await supabase
    .from('event_profiles')
    .select('*')
    .eq('spotify_id', spotifyId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check event: ${error.message}`);
  }

  return data || null;
}

/**
 * Create or update concert in event_profiles
 */
export async function upsertConcert(concertData: {
  spotify_id: string;
  talent_profile_id?: string;
  title?: string;
  status?: string;
  image?: string;
  spotify_url?: string;
  spotify_title?: string;
  spotify_category?: string;
  spotify_festival?: string;
  spotify_venue_name?: string;
  spotify_location_name?: string;
  spotify_latitude?: number;
  spotify_longitude?: number;
  spotify_artist_urls?: string;
  spotify_artist_ids?: string;
  spotify_artist_names?: string;
  spotify_date?: string;
  [key: string]: any;
}) {
  const concertPayload = {
    spotify_id: concertData.spotify_id,
    talent_profile_id: concertData.talent_profile_id || null,
    title: concertData.title || '',
    status: concertData.status || 'Todo',
    image: concertData.image || '',
    spotify_url: concertData.spotify_url || '',
    spotify_title: concertData.spotify_title || '',
    spotify_category: concertData.spotify_category || '',
    spotify_festival: concertData.spotify_festival || 'No',
    spotify_venue_name: concertData.spotify_venue_name || '',
    spotify_location_name: concertData.spotify_location_name || '',
    spotify_latitude: concertData.spotify_latitude || 0,
    spotify_longitude: concertData.spotify_longitude || 0,
    spotify_artist_urls: concertData.spotify_artist_urls || '',
    spotify_artist_ids: concertData.spotify_artist_ids || '',
    spotify_artist_names: concertData.spotify_artist_names || '',
    spotify_date: concertData.spotify_date || '',
    sp_check: 'completed',
    updated_at: new Date().toISOString(),
  };

  // Try to update first
  const { data: existing } = await supabase
    .from('event_profiles')
    .select('id')
    .eq('spotify_id', concertData.spotify_id)
    .maybeSingle();

  let data, error;

  if (existing) {
    ({ data, error } = await supabase
      .from('event_profiles')
      .update(concertPayload)
      .eq('spotify_id', concertData.spotify_id));
  } else {
    ({ data, error } = await supabase
      .from('event_profiles')
      .insert(concertPayload));
  }

  if (error) {
    throw new Error(`Failed to upsert concert: ${error.message}`);
  }

  return data;
}

// ============================================================================
// MUSICBRAINZ FUNCTIONS
// ============================================================================

/**
 * Get artists that need MusicBrainz enrichment:
 * - Must have musicbrainz_id set
 * - mb_check is null (never processed)
 */
export async function getArtistsForMusicBrainzEnrichment(limit?: number) {
  try {
    console.log('⏳ Fetching artists for MusicBrainz enrichment from Supabase...');

    let query = supabase
      .from('talent_profiles')
      .select('id, spotify_id, name, musicbrainz_id, mb_check')
      .not('musicbrainz_id', 'is', null)
      .is('mb_check', null);

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch artists for MusicBrainz: ${error.message}`);
    }

    console.log(`✅ Found ${data?.length || 0} artists to MusicBrainz-enrich`);
    return data || [];
  } catch (err: any) {
    console.error('⚠️ MusicBrainz query error:', err.message);
    return [];
  }
}

/**
 * Update a talent_profiles row with MusicBrainz enrichment data
 */
export async function updateArtistMusicBrainzData(
  spotifyId: string,
  mbFields: Record<string, any>
) {
  const { data, error } = await supabase
    .from('talent_profiles')
    .update({
      ...mbFields,
      updated_at: new Date().toISOString(),
    })
    .eq('spotify_id', spotifyId);

  if (error) {
    throw new Error(`Failed to update MusicBrainz data for ${spotifyId}: ${error.message}`);
  }

  return data;
}
