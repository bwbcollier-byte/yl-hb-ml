import dotenv from 'dotenv';
import https from 'https';
import {
  updateArtistSpotifyStatus,
  updateArtistSpotifyData,
  getPendingArtists,
} from './supabase';

dotenv.config();

// Configuration
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 5;

// RapidAPI keys for rotation (11 keys total)
const RAPIDAPI_KEYS = [
  'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
  '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
  '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
  'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
  '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460',
  '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241',
  '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00',
  'cea3641b50msh52581f483562ccdp186ee6jsn6759e8241393',
  '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9',
  '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4',
  '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7',
];

let currentKeyIndex = 0;
let keyRotationLock = false;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const toTitleCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Get next RapidAPI key (rotate through keys for rate limit distribution)
 */
async function getNextRapidAPIKey(): Promise<string> {
  while (keyRotationLock) {
    await sleep(10);
  }
  keyRotationLock = true;
  
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  
  keyRotationLock = false;
  return key;
}

/**
 * Fetch artist data from RapidAPI Spotify endpoint
 */
async function fetchSpotifyArtist(artistId: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const apiKey = await getNextRapidAPIKey();
    
    try {
      const requestBody = JSON.stringify({ id: artistId });
      
      const options = {
        hostname: 'spotify-api25.p.rapidapi.com',
        port: 443,
        path: '/getartist',
        method: 'POST',
        headers: {
          'X-Rapidapi-Key': apiKey,
          'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      };
      
      return await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e: any) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        });
        
        req.on('error', reject);
        req.write(requestBody);
        req.end();
      });
    } catch (error: any) {
      if (attempt === retries) throw error;
      await sleep(2000 * attempt);
    }
  }
}

/**
 * Extract genres from artist data
 */
function extractGenres(artistData: any): string {
  const biography = artistData.artistUnion?.profile?.biography?.text || '';
  
  const genreKeywords = [
    'R&B', 'R&amp;B', 'Pop', 'Hip-Hop', 'Hip Hop', 'Rap', 'Soul', 'Funk', 'Electronic',
    'Alternative', 'Indie', 'Rock', 'Jazz', 'Blues', 'Country', 'Dance', 'House', 'Techno'
  ];
  
  const foundGenres: string[] = [];
  for (const genre of genreKeywords) {
    if (biography.includes(genre) && !foundGenres.includes(genre.replace('&amp;', '&'))) {
      foundGenres.push(genre.replace('&amp;', '&'));
    }
  }
  
  return foundGenres.slice(0, 5).join(', ');
}

/**
 * Main enrichment function for Spotify artist data
 */
async function enrichArtistFromSpotify(spotifyId: string, artistName: string) {
  console.log(`\n📋 Processing: ${artistName} (${spotifyId})`);

  try {
    console.log(`   🔍 Fetching artist data from Spotify...`);
    const artistData = await fetchSpotifyArtist(spotifyId);
    console.log(`   ✅ Received artist data`);

    if (!artistData || !artistData.artistUnion) {
      console.log(`❌ Artist not found on Spotify`);
      await updateArtistSpotifyStatus(spotifyId, 'completed', { sp_data_status: 'Not Found' });
      return;
    }

    const artist = artistData.artistUnion;
    const stats = artist.stats || {};
    const relatedArtists = artist.relatedContent?.relatedArtists?.items || [];
    const topCities = stats.topCities?.items || [];
    
    // Extract counts
    const concertsCount = artist.goods?.events?.concerts?.totalCount || 0;
    const popularReleasesAlbumsCount = artist.discography?.popularReleasesAlbums?.totalCount || 0;
    const singlesCount = artist.discography?.singles?.totalCount || 0;
    const compilationsCount = artist.discography?.compilations?.totalCount || 0;
    const albumsCount = artist.discography?.albums?.totalCount || 0;

    console.log(`🎤 Concerts: ${concertsCount}, Albums: ${albumsCount}, Singles: ${singlesCount}`);
    
    // Extract images
    const galleryImages = artist.visuals?.gallery?.items || [];
    const largeImages = galleryImages
      .flatMap((item: any) => item.sources || [])
      .filter((source: any) => source.width >= 640)
      .map((source: any) => source.url)
      .slice(0, 10);

    const avatarImages = artist.visuals?.avatarImage?.sources || [];
    const avatarUrls = avatarImages.map((source: any) => source.url);

    // Clean biography
    const rawBiography = artist.profile?.biography?.text || '';
    const plainBiography = rawBiography
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#43;/g, '+');

    const genres = extractGenres(artistData);

    // Build update data
    const updateData: any = {
      name: artist.profile?.name || artistName,
      sp_about: plainBiography,
      sp_verified: artist.profile?.verified ? 'true' : 'false',
      sp_type: 'Artist',
      sp_gallery_urls: largeImages.join(', '),
      sp_avatar_image_urls: avatarUrls.join(', '),
      sp_image: avatarUrls[0] || '',
      sp_followers: stats.followers?.toString() || '',
      sp_listeners: stats.monthlyListeners?.toString() || '',
      sp_popularity: stats.worldRank?.toString() || '',
      sp_rank: stats.worldRank?.toString() || '',
      sp_genres: genres,
      sp_concerts_count: concertsCount.toString(),
      sp_albums_count: albumsCount.toString(),
      sp_singles_count: singlesCount.toString(),
      sp_compilations_count: compilationsCount.toString(),
      sp_popular_albums_count: popularReleasesAlbumsCount.toString(),
      sp_data_status: stats.followers || stats.monthlyListeners ? 'Updated' : 'Not Found',
      sp_check: 'completed',
      sp_check_updates: new Date().toISOString(),
    };

    // Add top cities
    if (topCities.length > 0) {
      for (let i = 0; i < Math.min(4, topCities.length); i++) {
        const city = topCities[i];
        updateData[`sp_city${i + 1}_city`] = city?.city || '';
        updateData[`sp_city${i + 1}_listeners`] = city?.numberOfListeners?.toString() || '';
        updateData[`sp_city${i + 1}_country`] = city?.country || '';
        updateData[`sp_city${i + 1}_region`] = city?.region || '';
      }
    }

    // Add related artists
    if (relatedArtists.length > 0) {
      updateData.sp_related_artist_ids = relatedArtists.slice(0, 20).map((a: any) => a.id).join(', ');
      updateData.sp_related_artist_names = relatedArtists.slice(0, 20).map((a: any) => a.name).join(', ');
    }

    // Update Supabase
    await updateArtistSpotifyData(spotifyId, updateData);
    console.log(`✅ Updated Supabase for ${artistName}`);

  } catch (error) {
    console.error(`❌ Error processing ${artistName}:`, error);
    await updateArtistSpotifyStatus(spotifyId, 'error', { sp_data_status: 'Error' });
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🎵 Spotify Artist Enrichment Started');
  console.log('🔑 Using RapidAPI with key rotation (11 keys)');
  console.log(`⚡ Parallel processing: ${CONCURRENCY} artists at a time`);
  if (LIMIT) console.log(`🔢 Limit: ${LIMIT} records`);
  console.log('');

  try {
    let artists = await getPendingArtists(LIMIT);
    
    // Fallback to test data if database query fails
    if (!artists || artists.length === 0) {
      console.log('⚠️  Database query failed or empty, using test data\n');
      artists = [
        { id: 'test-1', spotify_id: '06HL4z0CvFAxyc27GXpf94', name: 'Taylor Swift' },
        { id: 'test-2', spotify_id: '5XeFesPbtLpXzIVDNQP79', name: 'The Weeknd' },
      ];
      if (LIMIT) artists = artists.slice(0, LIMIT);
    }
    
    console.log(`📋 Found ${artists.length} pending artists to process\n`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < artists.length; i += CONCURRENCY) {
      const batch = artists.slice(i, i + CONCURRENCY);
      console.log(`\n🔄 Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(artists.length / CONCURRENCY)} (${batch.length} artists)\n`);
      
      const promises = batch.map(async (artist) => {
        const spotifyId = artist.spotify_id as string;
        const artistName = artist.name || 'Unknown Artist';

        if (!spotifyId) {
          console.log(`⏭️  Skipping ${artistName}: No Spotify ID`);
          skipped++;
          return;
        }

        try {
          await enrichArtistFromSpotify(spotifyId, artistName);
          processed++;
        } catch (error) {
          console.error(`Error enriching ${artistName}:`, error);
          errors++;
        }
      });
      
      await Promise.all(promises);
      
      if (i + CONCURRENCY < artists.length) {
        await sleep(1000);
      }
    }

    console.log('\n✅ Processing Complete!');
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
