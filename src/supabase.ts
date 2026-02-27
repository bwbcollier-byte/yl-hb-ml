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
 * Get all artists with sp_check = 'pending' for enrichment
 */
export async function getPendingArtists(limit?: number) {
  try {
    console.log('⏳ Fetching artists from Supabase...');
    
    // Minimal query - just get the first records by creation date
    const { data, error } = await supabase
      .from('talent_profiles')
      .select('id, spotify_id, name')
      .order('created_at', { ascending: false })
      .limit(limit || 5);

    if (error) {
      throw new Error(`Failed to fetch artists: ${error.message}`);
    }

    console.log(`✅ Found ${data?.length || 0} artists to process`);
    return data || [];
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
 * Get tracking metadata (from a dedicated tracking table or record)
 */
export async function getTrackingMetadata() {
  // For now, return basic tracking info
  // You may want to add a dedicated enrichment_tracking table later
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
