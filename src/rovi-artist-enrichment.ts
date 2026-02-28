import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';
import {
  getArtistsForRoviEnrichment,
  updateArtistRoviData,
  updateArtistRoviDataBatch
} from './supabase';
import { trackRoviStart, trackRoviEnd, trackRoviProgress } from './airtable-tracker';

dotenv.config();

// Configuration
const ROVI_BASE_URL = 'https://tivomusicapi-staging-elb.digitalsmiths.net/sd/tivomusicapi/taps/v3/lookup/artist';
const LIMIT_ENV = process.env.LIMIT || "";
const ENV_LIMIT = LIMIT_ENV.trim() !== "" ? parseInt(LIMIT_ENV, 10) : undefined;

/**
 * Interactive prompt for how many artists to process.
 */
function promptForLimit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    if ((typeof ENV_LIMIT === 'number' && !isNaN(ENV_LIMIT)) || process.env.CI) {
      if (typeof ENV_LIMIT === 'number' && !isNaN(ENV_LIMIT)) console.log(`\n🔢 Using LIMIT from environment: ${ENV_LIMIT}`);
      else console.log(`\n🤖 CI Environment detected, skipping interactive prompt.`);
      resolve(typeof ENV_LIMIT === 'number' && !isNaN(ENV_LIMIT) ? ENV_LIMIT : undefined);
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

function extractId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  // If it's a full URL, split by / and grab the last part
  if (urlOrId.includes('/')) {
    const parts = urlOrId.split('/').filter(p => p.trim() !== '');
    return parts[parts.length - 1];
  }
  return urlOrId;
}

/**
 * Build the query URL based on available IDs
 */
function buildRoviUrl(artist: any) {
  const params = new URLSearchParams();
  params.set('includeAllFields', 'true');

  const allmusicId = extractId(artist.social_allmusic_id);
  const appleMusicId = extractId(artist.social_apple_music_id);
  const amgPopId = extractId(artist.amg_pop_id);
  const amgClassicId = extractId(artist.amg_classic_id);

  if (allmusicId && allmusicId.startsWith('mn')) {
    params.set('nameId', allmusicId.toUpperCase());
  } else if (allmusicId && allmusicId.startsWith('MN')) {
    params.set('nameId', allmusicId);
  } else if (amgPopId || (allmusicId && allmusicId.startsWith('p'))) {
    params.set('amgPopId', amgPopId || allmusicId!);
  } else if (amgClassicId || (allmusicId && allmusicId.startsWith('q'))) {
    params.set('amgClassicId', amgClassicId || allmusicId!);
  } else if (appleMusicId) {
    const appleIdMatch = appleMusicId.match(/id(\d+)/);
    params.set('appleAdamId', appleIdMatch ? appleIdMatch[1] : appleMusicId);
  } else if (allmusicId) {
    // Fallback if it's just a raw ID without prefix
    params.set('nameId', allmusicId);
  }

  if (Array.from(params.keys()).length <= 1) return null; // Only includeAllFields set

  return `${ROVI_BASE_URL}?${params.toString()}`;
}

/**
 * Map API data to Supabase fields
 */
function mapRoviData(hit: any) {
  const bio = hit.musicBio?.biography?.[0]?.text || '';
  const bioAuthor = hit.musicBio?.biography?.[0]?.author || '';
  const headline = hit.musicBio?.headlineBio || '';
  const genres = hit.musicGenres ? hit.musicGenres.map((g: any) => g.name).join(', ') : null;
  const gallery = hit.images ? hit.images.map((img: any) => img.url).join(', ') : null;
  
  return {
    rovi_id: hit.id,
    rovi_headline: headline,
    rovi_bio: bio,
    rovi_bio_author: bioAuthor,
    rovi_birth_place: hit.birth?.place || null,
    rovi_birth_date: hit.birth?.date || null,
    rovi_active: hit.active ? hit.active.join(', ') : null,
    rovi_type: hit.type || null,
    rovi_gender: hit.gender || null,
    rovi_country: hit.country || null,
    rovi_genres: genres,
    rovi_album_count: hit.albumCount || null,
    rovi_release_count: hit.releaseCount || null,
    rovi_composed_track_count: hit.composedTrackCount || null,
    rovi_performed_track_count: hit.performedTrackCount || null,
    rovi_image: hit.images?.[0]?.url || null,
    rovi_gallery: gallery,
    rovi_check: 'completed'
  };
}

async function enrichArtist(artist: any) {
  console.log(`📋 Processing: ${artist.name}`);
  
  const url = buildRoviUrl(artist);
  if (!url) {
    console.log(`   ⚠️ No valid Rovi identifier found for ${artist.name}`);
    return { spotify_id: artist.spotify_id, rovi_check: 'no_id' };
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
    return { spotify_id: artist.spotify_id, rovi_check: 'no_data' };
  }

  const updateFields = mapRoviData(hit);
  return { spotify_id: artist.spotify_id, ...updateFields };
}

async function main() {
  console.log('\n🎵 Rovi/TiVo Artist Enrichment');
  console.log('==============================');

  await trackRoviStart();
  const limit = await promptForLimit();

  let totalProcessed = 0;
  let totalErrors = 0;

  try {
    console.log(limit ? `🚀 Target: ${limit} artists` : '🚀 Target: All pending artists');

    while (true) {
      // Fetch in batches of 1000 (Supabase default limit)
      const remainingLimit = limit ? limit - totalProcessed : 1000;
      if (limit && remainingLimit <= 0) break;

      const batchLimit = limit ? Math.min(remainingLimit, 1000) : 1000;
      const artists = await getArtistsForRoviEnrichment(batchLimit);

      if (artists.length === 0) {
        if (totalProcessed === 0) console.log('No artists to process. All caught up! ✅');
        else console.log('\n✅ No more artists found to process.');
        break;
      }

      console.log(`\n📦 Fetching next batch of ${artists.length} artists...`);

      let currentBatch: any[] = [];

      for (const artist of artists) {
        try {
          const update = await enrichArtist(artist);
          if (update) {
            currentBatch.push(update);
            
            // Console log to match 
            if (update.rovi_check === 'completed') {
              console.log(`   ✅ Buffered Rovi fields for batch save`);
            }
          }

          totalProcessed++;

          // Update progress and save every 100 records
          if (currentBatch.length >= 100) {
            console.log(`\n💾 Batch saving ${currentBatch.length} records to Supabase...`);
            try {
              await updateArtistRoviDataBatch(currentBatch);
            } finally {
              currentBatch = [];
            }
            
            console.log(`📊 Bulk progress update: ${totalProcessed} records done...`);
            await trackRoviProgress();
          }

          if (limit && totalProcessed >= limit) break;

          await sleep(500); // Conservative delay
        } catch (err: any) {
          console.error(`\n❌ Error processing ${artist.name}:`, err.message);
          totalErrors++;
        }
      }
      
      // Flush remaining items
      if (currentBatch.length > 0) {
        console.log(`\n💾 Catch-up batch saving ${currentBatch.length} records to Supabase...`);
        await updateArtistRoviDataBatch(currentBatch);
        currentBatch = [];
      }

      if (limit && totalProcessed >= limit) break;
    }

    console.log('\n==============================');
    console.log('✨ Rovi Enrichment Complete!');
    console.log(`✅ Processed: ${totalProcessed}`);
    console.log(`❌ Errors:    ${totalErrors}`);
    console.log('==============================\n');

    await trackRoviEnd(totalProcessed, totalErrors);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
