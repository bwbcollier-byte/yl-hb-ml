import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';
import {
  getArtistsForAudioDBEnrichment,
  updateArtistAudioDBData
} from './supabase';
import { trackAudioDBStart, trackAudioDBEnd, trackAudioDBProgress } from './airtable-tracker';

dotenv.config();

// Configuration
const AUDIODB_API_KEY = process.env.AUDIODB_API_KEY || '925704';
const ENV_LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

/**
 * Interactive prompt for how many artists to process.
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch artist data from TheAudioDB
 */
async function fetchAudioDBArtist(mbid: string) {
  const url = `https://www.theaudiodb.com/api/v1/json/${AUDIODB_API_KEY}/artist-mb.php?i=${mbid}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`TheAudioDB API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.artists ? data.artists[0] : null;
}

/**
 * Fetch social links from TheAudioDB
 */
async function fetchAudioDBSocial(adbId: string) {
  const url = `https://www.theaudiodb.com/api/v1/json/${AUDIODB_API_KEY}/artist-social.php?i=${adbId}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    console.warn(`  ⚠️ Could not fetch social links for ADB ID ${adbId}`);
    return null;
  }
  
  const data = await response.json();
  return data.socials ? data.socials[0] : null;
}

/**
 * Map API data to Supabase fields (only using columns that exist in the DB)
 */
function mapAudioDBData(artistData: any, socialData: any) {
  const fields: Record<string, any> = {
    adb_artist_id: artistData.idArtist,
    adb_artist: artistData.strArtist,
    adb_artist_stripped: artistData.strArtistStripped,
    adb_artist_alternate: artistData.strArtistAlternate,
    adb_label: artistData.strLabel,
    adb_label_id: artistData.idArtist, // Map artist ID as label ID if strLabel exists but no ID is provided, or usestrLabel
    adb_formed_year: artistData.intFormedYear,
    adb_born_year: artistData.intBornYear,
    adb_died_year: artistData.intDiedYear,
    adb_disbanded: artistData.strDisbanded,
    adb_style: artistData.strStyle,
    adb_genre: artistData.strGenre,
    adb_mood: artistData.strMood,
    adb_biography_en: artistData.strBiographyEN,
    adb_gender: artistData.strGender,
    adb_members_count: artistData.intMembers,
    adb_country: artistData.strCountry,
    adb_country_code: artistData.strCountryCode,
    adb_artist_thumb: artistData.strArtistThumb,
    adb_artist_logo: artistData.strArtistLogo,
    adb_artist_cutout: artistData.strArtistCutout,
    adb_artist_clearart: artistData.strArtistClearart,
    adb_artist_wide_thumb: artistData.strArtistWideThumb,
    adb_artist_fanart: artistData.strArtistFanart,
    adb_artist_fanart2: artistData.strArtistFanart2,
    adb_artist_fanart3: artistData.strArtistFanart3,
    adb_artist_fanart4: artistData.strArtistFanart4,
    adb_artist_banner: artistData.strArtistBanner,
    adb_musicbrainz_id: artistData.strMusicBrainzID,
    adb_isni_code: artistData.strISNIcode,
    adb_lastfm_chart: artistData.strLastFMChart,
    adb_charted: artistData.strCharted,
    adb_locked: artistData.strLocked,
    adb_check: 'completed'
  };

  // Label ID specifically
  if (artistData.idLabel) fields.adb_label_id = artistData.idLabel;

  if (socialData) {
    fields.adb_website = socialData.strWebsite;
    fields.adb_facebook = socialData.strFacebook;
    fields.adb_twitter = socialData.strTwitter;
    fields.adb_instagram = socialData.strInstagram;
    fields.adb_spotify = socialData.strSpotify;
    fields.adb_youtube = socialData.strYouTube;
    fields.adb_soundcloud = socialData.strSoundCloud;
    fields.adb_deezer = socialData.strDeezer;
    fields.adb_itunes = socialData.strItunes;
    fields.adb_discogs = socialData.strDiscogs;
    fields.adb_songkick = socialData.strSongkick;
    fields.adb_beatport = socialData.strBeatport;
    fields.adb_tidal = socialData.strTidal;
  }

  return fields;
}

async function enrichArtist(artist: any) {
  console.log(`📋 Processing: ${artist.name}`);
  let cleanMBID = artist.musicbrainz_id;

  // Handle full URL if presented
  if (cleanMBID.includes('musicbrainz.org')) {
    const parts = cleanMBID.split('/');
    cleanMBID = parts[parts.length - 1];
  }

  console.log(`   🔍 Fetching TheAudioDB data for ${cleanMBID}...`);
  const adbData = await fetchAudioDBArtist(cleanMBID);

  if (!adbData) {
    console.log(`   ⚠️ No data found in TheAudioDB for ${artist.name}`);
    await updateArtistAudioDBData(artist.spotify_id, { adb_check: 'no_data' });
    return;
  }

  console.log(`   🔍 Fetching social links for ADB ID ${adbData.idArtist}...`);
  const socialData = await fetchAudioDBSocial(adbData.idArtist);

  const updateFields = mapAudioDBData(adbData, socialData);
  await updateArtistAudioDBData(artist.spotify_id, updateFields);
  console.log(`   ✅ Saved ${Object.keys(updateFields).length} ADB fields to Supabase`);
}

async function main() {
  console.log('\n🎵 TheAudioDB Artist Enrichment');
  console.log('================================');

  await trackAudioDBStart();
  const limit = await promptForLimit();

  let processed = 0;
  let errors = 0;

  try {
    const artists = await getArtistsForAudioDBEnrichment(limit);

    if (artists.length === 0) {
      console.log('No artists to process. All caught up! ✅');
      return;
    }

    console.log(`\n📋 Processing ${artists.length} artist(s)...\n`);

    for (const artist of artists) {
      try {
        await enrichArtist(artist);
        processed++;

        // Update progress every 100 records
        if (processed > 0 && processed % 100 === 0) {
          console.log(`\n📊 Bulk progress update: ${processed} records done...`);
          await trackAudioDBProgress();
        }

        await sleep(1000); // Respect API rate limits
      } catch (err: any) {
        console.error(`\n❌ Error processing ${artist.name}:`, err.message);
        errors++;
      }
    }

    console.log('\n================================');
    console.log('✨ TheAudioDB Enrichment Complete!');
    console.log(`✅ Processed: ${processed}`);
    console.log(`❌ Errors:    ${errors}`);
    console.log('================================\n');

    await trackAudioDBEnd(processed, errors);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
