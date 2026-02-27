#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import * as https from 'https';
import { supabase, getAlbumBySpotifyId, upsertAlbum, getEventBySpotifyId, upsertConcert } from './src/supabase';

const RAPIDAPI_KEYS = [
  'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
];

const WEEKND_ID = '1Xyo4u8uXC1ZmMpatF05PJ';

async function fetchArtistData(artistId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'spotify-api25.p.rapidapi.com',
      port: 443,
      path: '/getartist',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_KEYS[0],
        'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ id: artistId }));
    req.end();
  });
}

async function processAlbums(discography: any, artistId: string, artistName: string) {
  // Flatten the nested releases structure
  const albumGroups = discography?.albums?.items || [];
  const flattenedAlbums: any[] = [];
  
  for (const group of albumGroups) {
    const releases = group.releases?.items || [];
    flattenedAlbums.push(...releases);
  }
  
  if (flattenedAlbums.length === 0) {
    console.log(`   📀 No albums found`);
    return { created: 0, updated: 0 };
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
  return { created, updated };
}

async function processConcerts(goods: any, artistId: string, artistName: string) {
  const concerts = goods?.events?.concerts?.items || [];
  if (concerts.length === 0) {
    console.log(`   🎪 No concerts found`);
    return { created: 0, updated: 0 };
  }

  console.log(`   🎪 Processing ${concerts.length} concerts...`);
  let created = 0;
  let updated = 0;

  for (const concert of concerts) {
    try {
      const spotifyId = concert.id;
      const existing = await getEventBySpotifyId(spotifyId);

      const concertData = {
        spotify_id: spotifyId,
        title: concert.title,
        spotify_venue_name: concert.venue?.name || '',
        spotify_location_name: concert.venue?.location?.name || '',
        spotify_latitude: concert.venue?.coordinates?.latitude || 0,
        spotify_longitude: concert.venue?.coordinates?.longitude || 0,
        spotify_date: concert.date?.isoString || '',
        spotify_artist_ids: JSON.stringify([artistId]),
        spotify_artist_names: JSON.stringify([artistName]),
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
  return { created, updated };
}

async function main() {
  console.log('🎵 Testing Weeknd Enrichment');
  console.log('============================\n');
  
  try {
    // Fetch artist data
    console.log('📡 Fetching Weeknd from Spotify API...');
    const response = await fetchArtistData(WEEKND_ID);
    
    if (!response.data || !response.data.artistUnion) {
      console.error('❌ Invalid API response structure');
      console.log('Response:', JSON.stringify(response).substring(0, 200));
      process.exit(1);
    }
    
    const artist = response.data.artistUnion;
    
    console.log(`✅ Artist: ${artist.profile.name}\n`);
    
    // Initialize Supabase
    console.log('🔗 Connected to Supabase\n');
    
    // Process albums
    const albumsResult = await processAlbums(artist.discography, WEEKND_ID, artist.profile.name);
    console.log(`   Result: ${albumsResult.created} created, ${albumsResult.updated} updated\n`);
    
    // Process concerts
    const concertsResult = await processConcerts(artist.goods, WEEKND_ID, artist.profile.name);
    console.log(`   Result: ${concertsResult.created} created, ${concertsResult.updated} updated\n`);
    
    // Summary
    console.log('✨ Test Complete');
    console.log('================');
    console.log(`Total albums processed: ${albumsResult.created + albumsResult.updated}`);
    console.log(`Total concerts processed: ${concertsResult.created + concertsResult.updated}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
