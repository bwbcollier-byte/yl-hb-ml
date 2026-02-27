import dotenv from 'dotenv';
import {
  getArtistsForAdbEnrichment,
  updateArtistAdbData,
} from './supabase';

dotenv.config();

// TheAudioDB API Configuration
const AUDIODB_API_KEY = process.env.AUDIODB_API_KEY || '925704';
const AUDIODB_API_BASE = 'https://www.theaudiodb.com/api/v1/json';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

// Utility: Sleep function for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch artist data from TheAudioDB using MusicBrainz ID
 */
async function fetchAudioDBArtist(musicbrainzId: string): Promise<any | null> {
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/artist-mb.php?i=${musicbrainzId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB API error: ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    if (data.artists && data.artists.length > 0) {
      return data.artists[0];
    }
    return null;
  } catch (error) {
    console.error(`   ❌ Error fetching AudioDB artist data:`, error);
    return null;
  }
}

/**
 * Search for artist by name when MusicBrainz ID is missing or fails
 */
async function searchAudioDBArtistByName(artistName: string): Promise<any | null> {
  const encodedName = encodeURIComponent(artistName);
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/search.php?s=${encodedName}`;

  try {
    console.log(`   🔍 Searching by artist name: "${artistName}"`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB Search API error: ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    if (data.artists && data.artists.length > 0) {
      // Try to find exact match
      const exactMatch = data.artists.find((artist: any) =>
        artist.strArtist?.toLowerCase() === artistName.toLowerCase()
      );

      if (exactMatch) {
        console.log(`   ✅ Found exact match: ${exactMatch.strArtist}`);
        return exactMatch;
      }

      // If no exact match, take first result but warn
      console.log(`   ⚠️  No exact match. Using first result: ${data.artists[0].strArtist}`);
      console.log(`   📊 Total results: ${data.artists.length}`);
      return data.artists[0];
    }

    console.log(`   ⚠️  No results found for artist name search`);
    return null;
  } catch (error) {
    console.error(`   ❌ Error searching AudioDB by artist name:`, error);
    return null;
  }
}

/**
 * Fetch social links from TheAudioDB
 */
async function fetchAudioDBSocial(artistId: string): Promise<any[]> {
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/artist-social.php?i=${artistId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB Social API error: ${response.status}`);
      return [];
    }

    const data: any = await response.json();
    if (data.artists && Array.isArray(data.artists)) {
      return data.artists;
    }
    return [];
  } catch (error) {
    console.error(`   ❌ Error fetching AudioDB social data:`, error);
    return [];
  }
}

/**
 * Extract social links from the social endpoint response
 */
function extractSocialLinks(socialData: any[]): Record<string, string> {
  const links: Record<string, string> = {};

  for (const entry of socialData) {
    const site = entry.strSite?.toLowerCase();
    const link = entry.strLink;

    if (!site || !link) continue;

    switch (site) {
      case 'instagram': links.adb_instagram = link; break;
      case 'spotify': links.adb_spotify = link; break;
      case 'youtube': links.adb_youtube = link; break;
      case 'soundcloud': links.adb_soundcloud = link; break;
      case 'deezer': links.adb_deezer = link; break;
      case 'itunes': links.adb_itunes = link; break;
      case 'discogs': links.adb_discogs = link; break;
      case 'songkick': links.adb_songkick = link; break;
      case 'beatport': links.adb_beatport = link; break;
      case 'tidal': links.adb_tidal = link; break;
      case 'twitter': links.adb_twitter = link; break;
      case 'facebook': links.adb_facebook = link; break;
      case 'website': links.adb_website = link; break;
    }
  }

  return links;
}

/**
 * Process a single artist record — fetch ADB data and build Supabase update payload
 */
async function processArtist(artist: any): Promise<{ spotifyId: string; fields: Record<string, any> } | null> {
  const artistName = artist.name || 'Unknown';
  const musicbrainzId = artist.musicbrainz_id;

  console.log(`\n📋 Processing: ${artistName}`);
  console.log(`   Spotify ID: ${artist.spotify_id}`);
  console.log(`   MusicBrainz ID: ${musicbrainzId || 'None'}`);

  let artistData = null;

  // Try MusicBrainz ID lookup first if available
  if (musicbrainzId) {
    console.log(`   🔍 Fetching TheAudioDB artist data via MusicBrainz ID...`);
    artistData = await fetchAudioDBArtist(musicbrainzId);
    await sleep(RATE_LIMIT_DELAY);
  }

  // Fallback to name search
  if (!artistData) {
    if (musicbrainzId) {
      console.log(`   ⚠️  No AudioDB data found via MusicBrainz ID`);
    }
    console.log(`   🔄 Attempting fallback search by artist name...`);
    artistData = await searchAudioDBArtistByName(artistName);
    await sleep(RATE_LIMIT_DELAY);
  }

  const now = new Date();
  const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD

  if (!artistData) {
    console.log(`   ❌ No AudioDB data found`);
    const existingUpdates = artist.adb_updates || '';
    const updateEntry = `${timestamp} - Not Found: No AudioDB data available`;
    return {
      spotifyId: artist.spotify_id,
      fields: {
        adb_status: 'Not Found',
        adb_check: timestamp,
        adb_updates: existingUpdates ? `${existingUpdates}\n${updateEntry}` : updateEntry,
      },
    };
  }

  console.log(`   ✅ Found TheAudioDB data for: ${artistData.strArtist}`);

  // Build Supabase update payload — map ADB response fields → supabase column names
  const updateFields: Record<string, any> = {};
  const updatedFieldsList: string[] = [];

  const mapField = (adbKey: string, supabaseCol: string, label: string) => {
    if (artistData[adbKey]) {
      updateFields[supabaseCol] = artistData[adbKey];
      updatedFieldsList.push(label);
    }
  };

  // Basic info
  mapField('idArtist', 'adb_artist_id', 'Artist ID');
  mapField('strArtist', 'adb_artist', 'Artist Name');
  mapField('strArtistStripped', 'adb_artist_stripped', 'Artist Stripped');
  mapField('strArtistAlternate', 'adb_artist_alternate', 'Artist Alternate');
  mapField('strLabel', 'adb_label', 'Label');
  mapField('idLabel', 'adb_label_id', 'Label ID');

  // Years
  mapField('intFormedYear', 'adb_formed_year', 'Formed Year');
  mapField('intBornYear', 'adb_born_year', 'Born Year');
  mapField('intDiedYear', 'adb_died_year', 'Died Year');
  mapField('strDisbanded', 'adb_disbanded', 'Disbanded');

  // Genre/Style
  mapField('strStyle', 'adb_style', 'Style');
  mapField('strGenre', 'adb_genre', 'Genre');
  mapField('strMood', 'adb_mood', 'Mood');

  // Basic Links
  mapField('strWebsite', 'adb_website', 'Website');
  mapField('strFacebook', 'adb_facebook', 'Facebook');

  // Biography
  mapField('strBiographyEN', 'adb_biography_en', 'Biography EN');

  // Artist Info
  mapField('strGender', 'adb_gender', 'Gender');
  mapField('intMembers', 'adb_members_count', 'Members');
  mapField('strCountry', 'adb_country', 'Country');
  mapField('strCountryCode', 'adb_country_code', 'Country Code');

  // Images
  mapField('strArtistThumb', 'adb_artist_thumb', 'Thumb');
  mapField('strArtistLogo', 'adb_artist_logo', 'Logo');
  mapField('strArtistCutout', 'adb_artist_cutout', 'Cutout');
  mapField('strArtistClearart', 'adb_artist_clearart', 'Clearart');
  mapField('strArtistWideThumb', 'adb_artist_wide_thumb', 'Wide Thumb');
  mapField('strArtistFanart', 'adb_artist_fanart', 'Fanart');
  mapField('strArtistFanart2', 'adb_artist_fanart2', 'Fanart2');
  mapField('strArtistFanart3', 'adb_artist_fanart3', 'Fanart3');
  mapField('strArtistFanart4', 'adb_artist_fanart4', 'Fanart4');
  mapField('strArtistBanner', 'adb_artist_banner', 'Banner');

  // Metadata
  mapField('strMusicBrainzID', 'adb_musicbrainz_id', 'MusicBrainz ID');
  mapField('strISNIcode', 'adb_isni_code', 'ISNI Code');
  mapField('strLastFMChart', 'adb_lastfm_chart', 'LastFM Chart');
  mapField('intCharted', 'adb_charted', 'Charted');
  mapField('strLocked', 'adb_locked', 'Locked');

  // Fetch social links if we have an artist ID
  if (artistData.idArtist) {
    console.log(`   🔍 Fetching social links...`);
    const socialData = await fetchAudioDBSocial(artistData.idArtist);
    await sleep(RATE_LIMIT_DELAY);

    if (socialData.length > 0) {
      console.log(`   ✅ Found ${socialData.length} social link entries`);
      const socialLinks = extractSocialLinks(socialData);
      Object.assign(updateFields, socialLinks);
    }
  }

  // Status + timestamp
  const isNew = !artist.adb_status || artist.adb_status === '';
  const status = isNew ? 'Complete' : 'Updated';
  updateFields.adb_status = status;
  updateFields.adb_check = timestamp;

  const updateEntry = `${timestamp} - ${status}: ${updatedFieldsList.length} fields updated`;
  const existingUpdates = artist.adb_updates || '';
  updateFields.adb_updates = existingUpdates ? `${existingUpdates}\n${updateEntry}` : updateEntry;

  console.log(`   ✅ Prepared update: ${Object.keys(updateFields).length} fields (${status})`);

  return { spotifyId: artist.spotify_id, fields: updateFields };
}

/**
 * Main execution
 */
async function main() {
  console.log('🎵 TheAudioDB Artist Enrichment (Supabase)');
  console.log('==========================================\n');
  console.log(`API Key: ${AUDIODB_API_KEY}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} records\n`);

  // Validate Supabase config
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }

  try {
    // Fetch artists from Supabase
    const artists = await getArtistsForAdbEnrichment(LIMIT);

    if (artists.length === 0) {
      console.log('No artists to process. All caught up! ✅');
      return;
    }

    console.log(`\n📋 Processing ${artists.length} artist(s)...\n`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const artist of artists) {
      try {
        const result = await processArtist(artist);

        if (result) {
          await updateArtistAdbData(result.spotifyId, result.fields);
          console.log(`   💾 Saved to Supabase ✅`);
          processed++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(`   ❌ Error processing ${artist.name}:`, err.message);

        // Try to write error status back
        try {
          const timestamp = new Date().toISOString().split('T')[0];
          await updateArtistAdbData(artist.spotify_id, {
            adb_status: 'Error',
            adb_check: timestamp,
            adb_updates: `${timestamp} - Error: ${err.message}`,
          });
        } catch (_) {
          // Best effort
        }

        errors++;
      }
    }

    console.log(`\n✅ ADB Enrichment Complete!`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped:   ${skipped}`);
    console.log(`   Errors:    ${errors}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
