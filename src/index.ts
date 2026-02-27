import dotenv from 'dotenv';
import https from 'https';
import readline from 'readline';
import { trackSpotifyStart, trackSpotifyEnd } from './airtable-tracker';
import {
  supabase,
  updateArtistSpotifyStatus,
  updateArtistSpotifyData,
  getPendingArtists,
  getAlbumBySpotifyId,
  upsertAlbum,
  getRelatedArtistBySpotifyId,
  createRelatedArtist,
  getEventBySpotifyId,
  upsertConcert,
  updateArtistAlbumCounts,
  updateArtistConcertCount,
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
function extractGenres(artist: any): string {
  const biography = artist.profile?.biography?.text || '';

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
 * Process albums from artist discography
 * Check if album exists -> upsert if exists, create if not
 */
async function processAlbums(discography: any, artistId: string, artistName: string, talentProfileId: string) {
  // Flatten the nested releases structure
  const albumGroups = discography?.albums?.items || [];
  const flattenedAlbums: any[] = [];

  for (const group of albumGroups) {
    const releases = group.releases?.items || [];
    flattenedAlbums.push(...releases);
  }

  if (flattenedAlbums.length === 0) {
    console.log(`   📀 No albums found`);
    return;
  }

  console.log(`   📀 Processing ${flattenedAlbums.length} albums...`);
  let created = 0;
  let updated = 0;

  for (const album of flattenedAlbums) {
    try {
      const spotifyAlbumId = album.id;
      const existing = await getAlbumBySpotifyId(spotifyAlbumId);

      const releaseYear = album.date?.year?.toString() || '';

      const albumData = {
        spotify_album_id: spotifyAlbumId,
        album_name: album.name,
        spotify_artist_id: artistId,
        spotify_artist_name: artistName,
        talent_profile_id: talentProfileId,
        spotify_type: album.type,
        cover_art_url: album.coverArt?.sources?.[0]?.url || '',
        release_date: `${album.date?.year || ''}-${String(album.date?.month || '').padStart(2, '0')}-${String(album.date?.day || '').padStart(2, '0')}`,
        release_year: releaseYear,
        track_count: album.tracks?.totalCount?.toString() || '0',
        label: album.label,
      };

      if (existing) {
        await upsertAlbum(albumData);
        updated++;
      } else {
        await upsertAlbum(albumData);
        created++;
      }
    } catch (error) {
      console.log(`      ⚠️  Failed to process album: ${error}`);
    }
  }

  console.log(`      ✅ Albums: ${created} created, ${updated} updated`);
}

/**
 * Process related artists
 * Create new artist records for related artists with additional metadata
 * Update origin artist with related artist IDs and names
 */
async function processRelatedArtists(relatedContent: any, parentArtistId: string, parentArtistName: string) {
  const relatedArtists = relatedContent?.relatedArtists?.items || [];
  if (relatedArtists.length === 0) {
    console.log(`   👥 No related artists found`);
    return;
  }

  console.log(`   👥 Processing ${relatedArtists.length} related artists...`);
  let created = 0;
  let skipped = 0;
  const relatedIds: string[] = [];
  const relatedNames: string[] = [];

  for (const artist of relatedArtists) {
    try {
      const spotifyId = artist.id;
      const artistName = artist.profile?.name || artist.name || '';
      const avatarUrl = artist.visuals?.avatarImage?.sources?.[0]?.url || '';

      const existing = await getRelatedArtistBySpotifyId(spotifyId);

      if (existing) {
        skipped++;
      } else {
        const artistData = {
          spotify_id: spotifyId,
          name: artistName,
          sp_type: 'Artist',
          sp_avatar_image_urls: avatarUrl,
          sp_image: avatarUrl,
          sp_data_status: 'Todo',
          sp_artist_id: spotifyId,
        };

        await createRelatedArtist(artistData);
        created++;
      }

      relatedIds.push(spotifyId);
      relatedNames.push(artistName);
    } catch (error) {
      console.log(`      ⚠️  Failed to process related artist: ${error}`);
    }
  }

  // Update origin record with related artist metadata
  try {
    const { data: originRecord } = await supabase
      .from('talent_profiles')
      .select('id')
      .eq('spotify_id', parentArtistId)
      .single();

    if (originRecord) {
      const updateData = {
        sp_related_artist_ids: relatedIds.join(','),
        sp_related_artist_names: relatedNames.map(n => toTitleCase(n)).join(','),
        sp_data_status: 'Complete',
        sp_check: new Date().toISOString(),
      };

      await supabase
        .from('talent_profiles')
        .update(updateData)
        .eq('spotify_id', parentArtistId);
    }
  } catch (error) {
    console.log(`      ⚠️  Failed to update origin record: ${error}`);
  }

  console.log(`      ✅ Related Artists: ${created} created, ${skipped} skipped`);
}

/**
 * Process concerts/events
 * Check if concert exists -> upsert if exists, create if not
 */
async function processConcerts(goods: any, artistId: string, artistName: string, talentProfileId: string, artistImage: string) {
  const concerts = goods?.events?.concerts?.items || [];
  if (concerts.length === 0) {
    console.log(`   🎪 No concerts found`);
    return;
  }

  console.log(`   🎪 Processing ${concerts.length} concerts...`);
  let created = 0;
  let updated = 0;

  for (const concert of concerts) {
    try {
      const spotifyEventId = concert.id;
      const existing = await getEventBySpotifyId(spotifyEventId);

      const venue = concert.venue || {};
      const coordinates = venue.coordinates || {};
      const dateStr = concert.date?.isoString || concert.date;

      // Collect artist info from concert
      const concertArtists = concert.artists?.items || [];
      const artistUrls = concertArtists.map((a: any) => a.uri).join(',');
      const artistIds = concertArtists.map((a: any) => a.id).join(',');
      const artistNames = concertArtists.map((a: any) => a.profile?.name || a.name).join(',');

      const concertData = {
        spotify_id: spotifyEventId,
        talent_profile_id: talentProfileId,
        title: concert.title || concert.name,
        status: 'Todo',
        image: artistImage,
        spotify_url: concert.uri,
        spotify_title: concert.title || concert.name,
        spotify_category: concert.category,
        spotify_festival: concert.festival ? 'Yes' : 'No',
        spotify_venue_name: venue.name,
        spotify_location_name: venue.location?.name,
        spotify_latitude: coordinates.latitude ? parseFloat(coordinates.latitude.toString()) : undefined,
        spotify_longitude: coordinates.longitude ? parseFloat(coordinates.longitude.toString()) : undefined,
        spotify_artist_urls: artistUrls,
        spotify_artist_ids: artistIds,
        spotify_artist_names: artistNames,
        spotify_date: dateStr,
      };

      if (existing) {
        await upsertConcert(concertData);
        updated++;
      } else {
        await upsertConcert(concertData);
        created++;
      }
    } catch (error) {
      console.log(`      ⚠️  Failed to process concert: ${error}`);
    }
  }

  console.log(`      ✅ Concerts: ${created} created, ${updated} updated`);
}

/**
 * Main enrichment function for Spotify artist data
 */
async function enrichArtistFromSpotify(spotifyId: string, artistName: string) {
  console.log(`\n📋 Processing: ${artistName} (${spotifyId})`);

  try {
    console.log(`   🔍 Fetching artist data from Spotify...`);
    const response = await fetchSpotifyArtist(spotifyId);
    console.log(`   ✅ Received artist data`);

    // Response structure: { data: { artistUnion: { ... } } }
    const artistData = response.data?.artistUnion;

    if (!artistData || !artistData.profile) {
      console.log(`❌ Artist not found on Spotify`);
      await updateArtistSpotifyStatus(spotifyId, 'completed', { sp_data_status: 'Not Found' });
      return;
    }

    const artist = artistData;
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

    const genres = extractGenres(artist);

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

    // Get talent_profile_id for linking related records
    const { data: profileData } = await supabase
      .from('talent_profiles')
      .select('id')
      .eq('spotify_id', spotifyId)
      .single();

    const talentProfileId = profileData?.id || null;
    const artistImage = avatarUrls[0] || '';

    // Process related data (albums, related artists, concerts)
    console.log(`\n   Processing additional data...`);

    // Process albums
    await processAlbums(artistData.discography, spotifyId, artistName, talentProfileId);

    // Process related artists
    await processRelatedArtists(artistData.relatedContent, spotifyId, artistName);

    // Process concerts
    await processConcerts(artistData.goods, spotifyId, artistName, talentProfileId, artistImage);

    console.log(`\n✅ Fully enriched ${artistName}\n`);

  } catch (error) {
    console.error(`❌ Error processing ${artistName}:`, error);
    await updateArtistSpotifyStatus(spotifyId, 'error', { sp_data_status: 'Error' });
    throw error;
  }
}

/**
 * Prompt user for number of records to process
 */
function promptForLimit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    // If LIMIT is already set via environment, use it
    if (LIMIT || process.env.CI) {
      if (LIMIT) console.log(`\n🔢 Using LIMIT from environment: ${LIMIT}`);
      else console.log(`\n🤖 CI Environment detected, skipping interactive prompt.`);
      resolve(LIMIT);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

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

/**
 * Main execution
 */
async function main() {
  console.log('🎵 Spotify Artist Enrichment Started');
  console.log('🔑 Using RapidAPI with key rotation (11 keys)');
  console.log(`⚡ Parallel processing: ${CONCURRENCY} artists at a time`);

  // Prompt for limit if not set
  const effectiveLimit = await promptForLimit();

  // Track start in Airtable
  await trackSpotifyStart();

  try {
    let artists = await getPendingArtists(effectiveLimit);

    // Fallback to test data if database query fails
    if (!artists || artists.length === 0) {
      console.log('No artists to process. All caught up! ✅');
      return;
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

    // Track end in Airtable
    await trackSpotifyEnd(processed, errors);


  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
