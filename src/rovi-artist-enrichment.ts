import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';
import {
  getArtistsForRoviEnrichment,
  updateArtistRoviData
} from './supabase';
import { trackRoviStart, trackRoviEnd } from './airtable-tracker';

dotenv.config();

// Configuration
const ROVI_BASE_URL = 'https://tivomusicapi-staging-elb.digitalsmiths.net/sd/tivomusicapi/taps/v3/lookup/artist';
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
 * Build the query URL based on available IDs
 */
function buildRoviUrl(artist: any) {
  const params = new URLSearchParams();
  params.set('includeAllFields', 'true');

  // Priority 1: nameId (MN...)
  if (artist.social_allmusic_id?.startsWith('MN')) {
    params.set('nameId', artist.social_allmusic_id);
  } 
  // Priority 2: amgPopId (P...)
  else if (artist.social_allmusic_id?.startsWith('P') || artist.amg_pop_id) {
    params.set('amgPopId', artist.social_allmusic_id || artist.amg_pop_id);
  }
  // Priority 3: amgClassicId (Q...)
  else if (artist.social_allmusic_id?.startsWith('Q') || artist.amg_classic_id) {
    params.set('amgClassicId', artist.social_allmusic_id || artist.amg_classic_id);
  }
  // Priority 4: appleAdamId
  else if (artist.social_apple_music_id) {
    // If it's a full URL, extract the ID
    const appleId = artist.social_apple_music_id.match(/id(\d+)/)?.[1] || artist.social_apple_music_id;
    params.set('appleAdamId', appleId);
  }

  if (Array.from(params.keys()).length <= 1) return null; // Only includeAllFields set

  return `${ROVI_BASE_URL}?${params.toString()}`;
}

/**
 * Map API data to Supabase fields
 */
function mapRoviData(hit: any) {
  const bio = hit.musicBio?.biography?.[0]?.text || '';
  const headline = hit.musicBio?.headlineBio || '';
  
  return {
    rovi_id: hit.id,
    rovi_headline: headline,
    rovi_bio: bio,
    rovi_birth_place: hit.birth?.place || null,
    rovi_birth_date: hit.birth?.date || null,
    rovi_active_years: hit.active ? hit.active.join(', ') : null,
    rovi_type: hit.type || null,
    rovi_album_count: hit.albumCount || null,
    rovi_release_count: hit.releaseCount || null,
    rovi_image: hit.images?.[0]?.url || null,
    rovi_check: 'completed'
  };
}

async function enrichArtist(artist: any) {
  console.log(`📋 Processing: ${artist.name}`);
  
  const url = buildRoviUrl(artist);
  if (!url) {
    console.log(`   ⚠️ No valid Rovi identifier found for ${artist.name}`);
    await updateArtistRoviData(artist.spotify_id, { rovi_check: 'no_id' });
    return;
  }

  console.log(`   🔍 Fetching Rovi data...`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Rovi API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const hit = data.hits?.[0];

  if (!hit) {
    console.log(`   ⚠️ No data found in Rovi for ${artist.name}`);
    await updateArtistRoviData(artist.spotify_id, { rovi_check: 'no_data' });
    return;
  }

  const updateFields = mapRoviData(hit);
  await updateArtistRoviData(artist.spotify_id, updateFields);
  console.log(`   ✅ Saved Rovi fields to Supabase`);
}

async function main() {
  console.log('\n🎵 Rovi/TiVo Artist Enrichment');
  console.log('==============================');

  await trackRoviStart();
  const limit = await promptForLimit();

  let processed = 0;
  let errors = 0;

  try {
    const artists = await getArtistsForRoviEnrichment(limit);

    if (artists.length === 0) {
      console.log('No artists to process. All caught up! ✅');
      return;
    }

    console.log(`\n📋 Processing ${artists.length} artist(s)...\n`);

    for (const artist of artists) {
      try {
        await enrichArtist(artist);
        processed++;
        await sleep(500); // Conservative delay
      } catch (err: any) {
        console.error(`\n❌ Error processing ${artist.name}:`, err.message);
        errors++;
      }
    }

    console.log('\n==============================');
    console.log('✨ Rovi Enrichment Complete!');
    console.log(`✅ Processed: ${processed}`);
    console.log(`❌ Errors:    ${errors}`);
    console.log('==============================\n');

    await trackRoviEnd(processed, errors);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
