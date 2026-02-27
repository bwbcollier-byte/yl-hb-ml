import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';
import {
  getArtistsForMusicBrainzEnrichment,
  updateArtistMusicBrainzData,
  getAlbumsByArtistId,
  updateAlbumMusicBrainzData,
} from './supabase';
import { trackMusicBrainzStart, trackMusicBrainzEnd } from './airtable-tracker';

dotenv.config();

// Configuration
const ENV_LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

/**
 * Interactive prompt for how many artists to process.
 * Skipped if LIMIT is already set via environment variable.
 */
function promptForLimit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (ENV_LIMIT || process.env.CI) {
      if (ENV_LIMIT) console.log(`\n🔢 Using LIMIT from environment: ${ENV_LIMIT}`);
      else console.log(`\n🤖 CI Environment detected, skipping interactive prompt.`);
      resolve(ENV_LIMIT);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n🔢 How many artists to process? (press Enter for all): ', (answer) => {
      rl.close();
      if (!answer || answer.trim() === '') {
        console.log('Processing all pending artists...');
        resolve(undefined);
      } else {
        const num = parseInt(answer.trim(), 10);
        if (isNaN(num) || num <= 0) {
          console.log('⚠️  Invalid input. Processing all artists.');
          resolve(undefined);
        } else {
          console.log(`Processing ${num} artists...`);
          resolve(num);
        }
      }
    });
  });
}

// Rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// User-Agent for MusicBrainz (required by their API policy)
const USER_AGENT = 'MusicBrainzEnrichment/1.0 (contact@example.com)';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MusicBrainzArtist {
  id: string;
  name: string;
  'sort-name'?: string;
  type?: string;
  gender?: string;
  country?: string;
  disambiguation?: string;
  'life-span'?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  area?: { name?: string };
  'begin-area'?: { name?: string };
  'end-area'?: { name?: string };
  isni?: string[];
  aliases?: Array<{
    name: string;
    'sort-name': string;
    type?: string;
  }>;
  tags?: Array<{
    count: number;
    name: string;
  }>;
  relations?: Array<{
    type: string;
    'type-id': string;
    direction?: string;
    url?: { resource: string };
    artist?: {
      id: string;
      name: string;
      'sort-name': string;
    };
    attributes?: string[];
    'attribute-values'?: Record<string, string>;
  }>;
  rating?: {
    value?: number;
    'votes-count'?: number;
  };
  'release-groups'?: Array<{
    id: string;
    title: string;
    'first-release-date'?: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
  }>;
}

// ============================================================================
// API FETCHERS
// ============================================================================

async function fetchMusicBrainzArtist(mbid: string): Promise<MusicBrainzArtist | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=aliases+tags+ratings+url-rels+artist-rels+release-groups&fmt=json`;

    console.log(`  🔍 Fetching MusicBrainz data for ${mbid}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`  ❌ MusicBrainz API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as MusicBrainzArtist;

    // MusicBrainz requires 1 second between requests
    await sleep(1000);

    return data;
  } catch (error) {
    console.error(`  ❌ Error fetching MusicBrainz data:`, error);
    return null;
  }
}

async function fetchReleaseGroupDetails(releaseGroupId: string): Promise<any | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?inc=releases+genres+tags&fmt=json`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    await sleep(1000);
    return data;
  } catch (error) {
    return null;
  }
}

async function fetchReleaseDetails(releaseId: string): Promise<any | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=labels+recordings+artist-credits+genres+tags+url-rels&fmt=json`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    await sleep(1000);
    return data;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Map MusicBrainz URL relations → Supabase social_* column names
 */
function extractSocialUrls(relations?: MusicBrainzArtist['relations']): Record<string, string> {
  const urls: Record<string, string> = {};

  if (!relations) return urls;

  const excludedTypes = ['purchase for download', 'review', 'online community', 'blog', 'image', 'discography entry', 'get the music'];

  for (const rel of relations) {
    if (excludedTypes.includes(rel.type)) continue;

    const url = rel.url?.resource;
    if (!url) continue;

    const urlLower = url.toLowerCase();

    if (urlLower.includes('instagram.com')) {
      urls['social_instagram'] = url;
    } else if (urlLower.includes('facebook.com')) {
      urls['social_facebook'] = url;
    } else if (urlLower.includes('music.youtube.com')) {
      urls['social_youtube_music'] = url;
    } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      urls['social_youtube'] = url;
    } else if (urlLower.includes('tiktok.com')) {
      urls['social_tiktok'] = url;
    } else if (urlLower.includes('bandsintown.com')) {
      urls['social_bandsintown'] = url;
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      urls['social_twitter'] = url;
    } else if (urlLower.includes('shazam.com')) {
      urls['social_shazam'] = url;
    } else if (urlLower.includes('music.apple.com')) {
      urls['social_apple_music'] = url;
    } else if (urlLower.includes('amazon.com') && urlLower.includes('music')) {
      urls['social_amazon_music'] = url;
    } else if (urlLower.includes('amazon.com') && urlLower.includes('store')) {
      urls['social_amazon_store'] = url;
    } else if (urlLower.includes('chartmetric.com')) {
      urls['social_chartmetric'] = url;
    } else if (urlLower.includes('soundcloud.com')) {
      urls['social_soundcloud'] = url;
    } else if (urlLower.includes('wikipedia.org')) {
      urls['social_wikipedia'] = url;
    } else if (urlLower.includes('wikidata.org')) {
      urls['social_wikidata'] = url;
    } else if (urlLower.includes('songkick.com')) {
      urls['social_songkick'] = url;
    } else if (urlLower.includes('deezer.com')) {
      urls['social_deezer'] = url;
    } else if (urlLower.includes('itunes.apple.com')) {
      urls['social_itunes'] = url;
    } else if (urlLower.includes('last.fm')) {
      urls['social_lastfm'] = url;
    } else if (urlLower.includes('bandcamp.com')) {
      urls['social_bandcamp'] = url;
    } else if (urlLower.includes('imvdb.com')) {
      urls['social_imvdb'] = url;
    } else if (urlLower.includes('themoviedb.org') || urlLower.includes('tmdb.org')) {
      urls['social_tmdb'] = url;
    } else if (urlLower.includes('trends.google.com')) {
      urls['social_googletrends'] = url;
    } else if (urlLower.includes('pandora.com')) {
      urls['social_pandora'] = url;
    } else if (urlLower.includes('tidal.com')) {
      urls['social_tidal'] = url;
    } else if (urlLower.includes('imdb.com')) {
      urls['social_imdb'] = url;
    } else if (urlLower.includes('iheart.com') || urlLower.includes('iheartradio.com')) {
      urls['social_iheartradio'] = url;
    } else if (urlLower.includes('discogs.com')) {
      urls['social_discogs'] = url;
    } else if (urlLower.includes('beatport.com')) {
      urls['social_beatport'] = url;
    } else if (urlLower.includes('audiomack.com')) {
      urls['social_audiomack'] = url;
    } else if (urlLower.includes('myspace.com')) {
      urls['social_myspace'] = url;
    } else if (urlLower.includes('vevo.com')) {
      urls['social_vevo'] = url;
    } else if (urlLower.includes('genius.com')) {
      urls['social_genius'] = url;
    } else if (urlLower.includes('setlist.fm')) {
      urls['social_setlistfm'] = url;
    } else if (urlLower.includes('musixmatch.com')) {
      urls['social_musixmatch'] = url;
    } else if (urlLower.includes('qobuz.com')) {
      urls['social_qobuz'] = url;
    } else if (urlLower.includes('napster.com')) {
      urls['social_napster'] = url;
    } else if (urlLower.includes('allmusic.com')) {
      urls['social_allmusic_id'] = url;
      urls['social_allmusic'] = url;
    } else if (rel.type === 'official homepage' && !urls['social_website']) {
      urls['social_website'] = url;
    }
  }

  return urls;
}

function extractArtistRelationships(relations?: MusicBrainzArtist['relations']): {
  members: string[];
  associated: string[];
  collaborators: string[];
} {
  const members: string[] = [];
  const associated: string[] = [];
  const collaborators: string[] = [];

  if (!relations) return { members, associated, collaborators };

  for (const rel of relations) {
    if (!rel.artist) continue;

    const artistName = rel.artist.name;
    const relType = rel.type;

    if (['member of band', 'member', 'founder'].includes(relType)) {
      if (!members.includes(artistName)) members.push(artistName);
    } else if (relType === 'collaboration') {
      if (!collaborators.includes(artistName)) collaborators.push(artistName);
    } else if (['supporting musician', 'involved with', 'part of'].includes(relType)) {
      if (!associated.includes(artistName)) associated.push(artistName);
    }
  }

  return { members, associated, collaborators };
}

function titleCase(str: string): string {
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

// ============================================================================
// ALBUM ENRICHMENT (Supabase media_profiles)
// ============================================================================

/**
 * Fuzzy-match a MusicBrainz release group title to an album in media_profiles
 */
function matchAlbum(mbReleaseGroupTitle: string, mbYear: string | undefined, supabaseAlbums: any[]): any | null {
  const normalize = (name: string) =>
    name.replace(/^(the|a|an)\s+/i, '').replace(/[^a-z0-9]/g, '').toLowerCase();

  const mbTitleNorm = normalize(mbReleaseGroupTitle);

  for (const album of supabaseAlbums) {
    const albumName = album.album_name || '';
    const albumYear = album.release_year || album.release_date?.substring(0, 4) || '';

    if (mbTitleNorm === normalize(albumName)) {
      // If year is available, require it to match
      if (mbYear && albumYear && mbYear !== albumYear) continue;
      return album;
    }
  }

  return null;
}

async function enrichAlbums(
  artistName: string,
  releaseGroups: MusicBrainzArtist['release-groups'] | undefined,
  spotifyArtistId: string | undefined
) {
  if (!releaseGroups || releaseGroups.length === 0 || !spotifyArtistId) return;

  // Filter Album primary-type only
  const albums = releaseGroups.filter(rg => rg['primary-type'] === 'Album');
  if (albums.length === 0) {
    console.log(`  ℹ️  No album release groups in MusicBrainz for ${artistName}`);
    return;
  }

  // Fetch artist's albums from Supabase media_profiles
  let supabaseAlbums: any[] = [];
  try {
    supabaseAlbums = await getAlbumsByArtistId(spotifyArtistId);
  } catch (err: any) {
    console.error(`  ❌ Error fetching albums from Supabase:`, err.message);
    return;
  }

  if (supabaseAlbums.length === 0) {
    console.log(`  ℹ️  No albums found in Supabase for ${artistName}`);
    return;
  }

  console.log(`  💿 ${supabaseAlbums.length} album(s) in Supabase, ${albums.length} release group(s) in MusicBrainz`);

  let albumsEnriched = 0;

  for (const mbReleaseGroup of albums) {
    const mbYear = mbReleaseGroup['first-release-date']?.substring(0, 4);
    const matchedAlbum = matchAlbum(mbReleaseGroup.title, mbYear, supabaseAlbums);

    if (!matchedAlbum) {
      console.log(`    ℹ️  No Supabase match for: "${mbReleaseGroup.title}" (${mbYear || 'N/A'})`);
      continue;
    }

    console.log(`    ✅ Matched: "${matchedAlbum.album_name}" ↔ "${mbReleaseGroup.title}"`);

    // Fetch release group + individual release details
    const rgDetails = await fetchReleaseGroupDetails(mbReleaseGroup.id);
    if (!rgDetails?.releases?.length) {
      console.log(`    ⚠️  No releases found for release group`);
      continue;
    }

    const officialRelease = rgDetails.releases.find((r: any) => r.status === 'Official') || rgDetails.releases[0];
    const fullRelease = await fetchReleaseDetails(officialRelease.id);
    if (!fullRelease) {
      console.log(`    ⚠️  Could not fetch release details`);
      continue;
    }

    // Build album MB update fields — using snake_case column names
    const albumFields: Record<string, any> = {};

    if (fullRelease.id) albumFields.mb_musicbrainz_id = fullRelease.id;
    if (fullRelease.country) albumFields.mb_release_country = fullRelease.country;
    if (fullRelease.barcode) albumFields.mb_barcode = fullRelease.barcode;
    if (fullRelease.status) albumFields.mb_status = fullRelease.status;

    if (fullRelease['label-info']?.length > 0) {
      const labels = fullRelease['label-info']
        .map((li: any) => li.label?.name)
        .filter(Boolean)
        .join(', ');
      if (labels) albumFields.mb_label_info = labels;
    }

    if (fullRelease.media?.length > 0) {
      const totalTracks = fullRelease.media.reduce((sum: number, m: any) => sum + (m['track-count'] || 0), 0);
      if (totalTracks > 0) albumFields.mb_track_count = totalTracks.toString();

      const formats = fullRelease.media.map((m: any) => m.format).filter(Boolean).join(', ');
      if (formats) albumFields.mb_media = formats;
    }

    if (rgDetails.genres?.length > 0) {
      albumFields.mb_genres = rgDetails.genres
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 10)
        .map((g: any) => titleCase(g.name))
        .join(', ');
    }

    if (rgDetails.tags?.length > 0) {
      const genreNames = rgDetails.genres?.map((g: any) => g.name.toLowerCase()) || [];
      albumFields.mb_tags = rgDetails.tags
        .filter((t: any) => !genreNames.includes(t.name.toLowerCase()))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 15)
        .map((t: any) => titleCase(t.name))
        .join(', ');
    }

    if (Object.keys(albumFields).length > 0 && matchedAlbum.spotify_album_id) {
      try {
        await updateAlbumMusicBrainzData(matchedAlbum.spotify_album_id, albumFields);
        albumsEnriched++;
        console.log(`    💾 Enriched: "${matchedAlbum.album_name}" (${Object.keys(albumFields).length} fields)`);
      } catch (err: any) {
        console.error(`    ❌ Error updating album "${matchedAlbum.album_name}":`, err.message);
      }
    }
  }

  if (albumsEnriched > 0) {
    console.log(`  💿 Enriched ${albumsEnriched} album(s) in Supabase`);
  }
}

// ============================================================================
// ARTIST ENRICHMENT
// ============================================================================

async function enrichArtist(artist: any): Promise<void> {
  const { spotify_id, musicbrainz_id: rawMbid, name: artistName } = artist;

  // musicbrainz_id may be stored as a full URL — extract just the UUID
  const mbidMatch = rawMbid?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  const mbid = mbidMatch ? mbidMatch[1] : rawMbid;

  console.log(`\n📋 Processing: ${artistName}`);
  console.log(`   MBID: ${mbid}`);

  const mbData = await fetchMusicBrainzArtist(mbid);
  if (!mbData) {
    console.log(`  ⚠️  Skipping - no MusicBrainz data found`);
    return;
  }

  // Extract social URLs
  const socialUrls = extractSocialUrls(mbData.relations);
  console.log(`  🔗 Social URLs extracted: ${Object.keys(socialUrls).length}`);

  // Extract artist relationships
  const relationships = extractArtistRelationships(mbData.relations);

  // Build update payload for talent_profiles
  const updateFields: Record<string, any> = {
    mb_check: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  };

  // Life span
  if (mbData['life-span']?.begin) {
    const dateString = mbData['life-span'].begin;

    const yearMatch = dateString.match(/^(\d{4})/);
    if (yearMatch) updateFields.formed_year = yearMatch[1];

    // Full date only (YYYY-MM-DD)
    const ddmmyyyy = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const iso = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
      updateFields.formed_date = iso;
      updateFields.mb_birthdate = iso;
    } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      updateFields.formed_date = dateString;
      updateFields.mb_birthdate = dateString;
    }
  }

  if (mbData.type) updateFields.mb_artist_type = mbData.type;
  if (mbData.gender) updateFields.mb_gender = mbData.gender;
  if (mbData.country) updateFields.mb_country = mbData.country;
  if (mbData.area?.name) updateFields.mb_area = mbData.area.name;
  if (mbData.disambiguation) updateFields.mb_disambiguation = mbData.disambiguation;
  if (mbData['sort-name']) updateFields.mb_sort_name = mbData['sort-name'];

  if (mbData.isni && mbData.isni.length > 0) {
    updateFields.mb_isni_code = mbData.isni.join(', ');
  }

  if (mbData.aliases && mbData.aliases.length > 0) {
    updateFields.mb_aliases = mbData.aliases
      .map(a => a.name)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 20)
      .join(', ');
  }

  const beginEnd: string[] = [];
  if (mbData['begin-area']?.name) beginEnd.push(mbData['begin-area'].name);
  if (mbData['end-area']?.name) beginEnd.push(mbData['end-area'].name);
  if (beginEnd.length > 0) updateFields.mb_begin_end_area = beginEnd.join(', ');

  if (mbData.tags && mbData.tags.length > 0) {
    updateFields.mb_genres = mbData.tags
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(t => titleCase(t.name))
      .join(', ');
  }

  if (relationships.members.length > 0) updateFields.mb_members = relationships.members.join(', ');
  if (relationships.associated.length > 0) updateFields.mb_associated = relationships.associated.join(', ');
  if (relationships.collaborators.length > 0) updateFields.mb_collaborators = relationships.collaborators.join(', ');

  // Social URLs — only update fields that are currently empty in the existing row
  for (const [col, url] of Object.entries(socialUrls)) {
    // Only fill if the column is currently null/empty in the fetched artist row
    if (!artist[col]) {
      updateFields[col] = url;
    }
  }

  // Write to Supabase
  await updateArtistMusicBrainzData(spotify_id, updateFields);
  console.log(`  💾 Saved ${Object.keys(updateFields).length} fields to Supabase ✅`);

  // Enrich albums in media_profiles
  await enrichAlbums(artistName, mbData['release-groups'], spotify_id);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🎵 MusicBrainz & TheAudioDB Enrichment (Supabase)');
  console.log('==================================================\n');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }

  // Track start in Airtable
  await trackMusicBrainzStart();

  const limit = await promptForLimit();


  let processed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const artists = await getArtistsForMusicBrainzEnrichment(limit);

    if (artists.length === 0) {
      console.log('No artists to process. All caught up! ✅');
      return;
    }

    console.log(`\n📋 Processing ${artists.length} artist(s)...\n`);

    for (const artist of artists) {
      if (!artist.musicbrainz_id) {
        console.log(`⏭️  Skipping ${artist.name} — no MusicBrainz ID`);
        skipped++;
        continue;
      }

      try {
        await enrichArtist(artist);
        processed++;
      } catch (err: any) {
        console.error(`\n❌ Error processing ${artist.name}:`, err.message);

        // Best-effort error status write
        try {
          await updateArtistMusicBrainzData(artist.spotify_id, {
            mb_check: `ERROR: ${err.message}`,
          });
        } catch (_) { }

        errors++;
      }
    }

    console.log('\n==================================================');
    console.log('✨ MusicBrainz Enrichment Complete!');
    console.log(`✅ Processed: ${processed}`);
    console.log(`⏭️  Skipped:   ${skipped}`);
    console.log(`❌ Errors:    ${errors}`);
    console.log('==================================================\n');

    // Track end in Airtable
    await trackMusicBrainzEnd(processed, errors);


  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
