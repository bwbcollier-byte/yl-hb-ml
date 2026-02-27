import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';
import {
  getArtistsForMusicFetchEnrichment,
  updateArtistMusicFetchData
} from './supabase';
import { trackMusicFetchStart, trackMusicFetchEnd, trackMusicFetchProgress } from './airtable-tracker';

dotenv.config();

/**
 * Interactive prompt for the MusicFetch API Token
 */
function promptForToken(): Promise<string> {
  return new Promise((resolve) => {
    if (process.env.MUSICFETCH_TOKEN) {
      console.log('🔑 Using MusicFetch Token from environment variable.');
      resolve(process.env.MUSICFETCH_TOKEN);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n🔑 Enter your MusicFetch API Token (x-token): ', (answer) => {
      rl.close();
      if (!answer || answer.trim() === '') {
        console.error('❌ Token is required to run this enrichment.');
        process.exit(1);
      }
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive prompt for how many artists to process
 */
function promptForLimit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n🔢 How many artists to process? (press Enter for default 100): ', (answer) => {
      rl.close();
      if (!answer || answer.trim() === '') {
        resolve(100);
      } else {
        const num = parseInt(answer.trim(), 10);
        resolve(isNaN(num) ? 100 : num);
      }
    });
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Map MusicFetch services to Supabase social columns
 */
/**
 * Map MusicFetch services to Supabase socials
 */
function mapServices(services: any, existingArtist: any) {
  const socialMap: Record<string, string> = {};
  const allSocialUrls: string[] = [];
  const allVideoUrls: string[] = [];
  
  const mapping: Record<string, string> = {
    'appleMusic': 'social_apple_music',
    'instagram': 'social_instagram',
    'facebook': 'social_facebook',
    'twitter': 'social_twitter',
    'x': 'social_twitter',
    'youtube': 'social_youtube',
    'youtubeMusic': 'social_youtube_music',
    'tiktok': 'social_tiktok',
    'soundcloud': 'social_soundcloud',
    'deezer': 'social_deezer',
    'tidal': 'social_tidal',
    'shazam': 'social_shazam',
    'pandora': 'social_pandora',
    'qobuz': 'social_qobuz',
    'audiomack': 'social_audiomack',
    'beatport': 'social_beatport',
    'bandcamp': 'social_bandcamp',
    'discogs': 'social_discogs',
    'genius': 'social_genius',
    'iHeartRadio': 'social_iheartradio',
    'amazonMusic': 'social_amazon_music',
    'amazon': 'social_amazon_store',
    'wikipedia': 'social_wikipedia',
    'musicBrainz': 'musicbrainz_id'
  };

  const videoServices = ['youtube', 'youtubeMusic', 'tiktok', 'vimeo', 'trebel'];

  for (const [mfKey, serviceData] of Object.entries(services)) {
    const link = (serviceData as any)?.link;
    if (!link) continue;

    // 1. Add to specific columns if they exist and are empty
    const sbColumn = mapping[mfKey];
    if (sbColumn && !existingArtist[sbColumn]) {
      socialMap[sbColumn] = link;
    }

    // 2. Categorize for the aggregate columns
    if (videoServices.includes(mfKey)) {
      allVideoUrls.push(link);
    } else {
      allSocialUrls.push(link);
    }
  }

  return {
    socialMap,
    mf_socials: allSocialUrls.join(', '),
    mf_videos: allVideoUrls.join(', ')
  };
}

async function fetchMusicFetchData(spotifyId: string, token: string) {
  const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;
  const services = 'spotify,amazon,anghami,youtubeMusic,youseeMusik,youtube,trebel,amazonMusic,audiomack,audius,awa,bandcamp,beatport,boomplay,deezer,discogs,flo,gaana,genius,iHeartRadio,jioSaavn,appleMusic,joox,kkbox,instagram,lineMusic,netease,musicBrainz,pandora,qobuz,qqMusic,sevenDigital,shazam,soundcloud,tidal,tiktok,yandex,wikipedia,x';
  
  const url = `https://api.musicfetch.io/url?url=${encodeURIComponent(spotifyUrl)}&services=${encodeURIComponent(services)}&country=US&withTracks=false`;

  const response = await fetch(url, {
    headers: { 'x-token': token }
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Invalid or expired MusicFetch token');
  }

  if (!response.ok) {
    throw new Error(`MusicFetch API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result;
}

async function enrichArtist(artist: any, token: string) {
  console.log(`📋 Processing: ${artist.name}`);
  
  try {
    const mfData = await fetchMusicFetchData(artist.spotify_id, token);
    
    if (!mfData) {
      console.log(`   ⚠️ No data found in MusicFetch for ${artist.name}`);
      await updateArtistMusicFetchData(artist.spotify_id, { mf_check: 'no_data' });
      return;
    }

    const { socialMap, mf_socials, mf_videos } = mapServices(mfData.services || {}, artist);
    
    const updateFields: Record<string, any> = {
      ...socialMap,
      mf_id: mfData.id || null,
      mf_dob: mfData.dateOfBirth || null,
      mf_hometown: mfData.hometown || null,
      mf_description: mfData.description || null,
      mf_aliases: mfData.aliases ? mfData.aliases.join(', ') : null,
      mf_image: mfData.image?.url || null,
      mf_socials: mf_socials || null,
      mf_videos: mf_videos || null,
      mf_check: 'completed'
    };

    // If MusicBrainz ID was found, clean it up (it might be a URL)
    if (updateFields.musicbrainz_id && updateFields.musicbrainz_id.includes('musicbrainz.org')) {
      const parts = updateFields.musicbrainz_id.split('/');
      updateFields.musicbrainz_id = parts[parts.length - 1];
    }

    await updateArtistMusicFetchData(artist.spotify_id, updateFields);
    console.log(`   ✅ Saved MusicFetch fields and ${Object.keys(socialMap).length} social links`);

  } catch (err: any) {
    console.error(`   ❌ Error: ${err.message}`);
    if (err.message.includes('token')) throw err; // Fatal
    await updateArtistMusicFetchData(artist.spotify_id, { mf_check: `error: ${err.message}` });
  }
}

async function main() {
  console.log('\n🎵 MusicFetch Artist Enrichment');
  console.log('===============================');

  const token = await promptForToken();
  const limit = await promptForLimit();

  await trackMusicFetchStart();

  let totalProcessed = 0;
  let totalErrors = 0;

  try {
    console.log(limit ? `🚀 Target: ${limit} artists` : '🚀 Target: All pending artists');

    while (true) {
      // Fetch in batches of 1000 (Supabase default limit)
      const remainingLimit = limit ? limit - totalProcessed : 1000;
      if (limit && remainingLimit <= 0) break;

      const batchLimit = limit ? Math.min(remainingLimit, 1000) : 1000;
      const artists = await getArtistsForMusicFetchEnrichment(batchLimit);

      if (artists.length === 0) {
        if (totalProcessed === 0) console.log('No artists to process. All caught up! ✅');
        else console.log('\n✅ No more artists found to process.');
        break;
      }

      console.log(`\n📦 Fetching next batch of ${artists.length} artists...`);

      for (const artist of artists) {
        try {
          await enrichArtist(artist, token);
          totalProcessed++;

          // Update progress every 100 records
          if (totalProcessed > 0 && totalProcessed % 100 === 0) {
            console.log(`\n📊 Bulk progress update: ${totalProcessed} records done...`);
            await trackMusicFetchProgress();
          }

          if (limit && totalProcessed >= limit) break;

          await sleep(2000); // 40 reqs/min limit (using 2s to be safe)
        } catch (err: any) {
          console.error(`\n❌ Fatal error:`, err.message);
          totalErrors++;
          if (err.message.includes('token')) break;
        }
      }

      if (limit && totalProcessed >= limit) break;
    }

    console.log('\n===============================');
    console.log('✨ MusicFetch Enrichment Complete!');
    console.log(`✅ Processed: ${totalProcessed}`);
    console.log(`❌ Errors:    ${totalErrors}`);
    console.log('===============================\n');

    await trackMusicFetchEnd(totalProcessed, totalErrors);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
