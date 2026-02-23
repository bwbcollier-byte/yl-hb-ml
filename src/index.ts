import dotenv from 'dotenv';
import Airtable from 'airtable';
import https from 'https';

dotenv.config();

// Configuration
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appiYGWjEZVB76yyl';
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblQ3DrCHekgRqj7Z';
const VIEW_NAME = process.env.AIRTABLE_VIEW_NAME || 'viwyL6dqnZWsdT7Sf';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

// Tracking record for checked artists (HB | Data | Process base)
const TRACKING_BASE_ID = 'app9fa6QAvW2krtmv';
const TRACKING_TABLE_ID = 'tblBUPP0YC8694oRx';
const TRACKING_RECORD_ID = 'recFtpo2F22CuTkle';

// Tracking record for albums (HB | Data | Process base)
const ALBUMS_TRACKING_RECORD_ID = 'recfrorETns2CY6F2';

// Tracking record for concerts (HB | Data | Process base)
const CONCERTS_TRACKING_RECORD_ID = 'recfR0VU4Peymu0DN';

// Albums base/table (HB | Music | Albums)
const ALBUMS_BASE_ID = 'appYXhhXgVkSblLdl';
const ALBUMS_TABLE_ID = 'tblYaSMImRbOr9CX3';

// Concerts base/table (HB | Music | Concerts)
const CONCERTS_BASE_ID = 'appD0CUBP0BjoGhnX';
const CONCERTS_TABLE_ID = 'tblyiHfAmzkwAz89x';

// RapidAPI keys for rotation (11 keys total)
const RAPIDAPI_KEYS = [
  'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13', // 500,000 PM | 1000 RPH
  '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82', // 500,000 PM | 1000 RPH
  '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42', // 500,000 PM | 1000 RPH
  'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500', // 200 PM | 1000 RPH
  '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460', // 500,000 PM | 1000 RPH
  '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241', // 500,000 PM | 1000 RPH
  '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00', // 200 PM | 1000 RPH
  'cea3641b50msh52581f483562ccdp186ee6jsn6759e8241393', // 500,000 PM | 1000 RPH
  '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9', // 200 PM | 1000 RPH
  '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4', // 200 PM | 1000 RPH
  '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7', // 500,000 PM | 1000 RPH
];

let currentKeyIndex = 0;

// Initialize Airtable
Airtable.configure({ apiKey: AIRTABLE_TOKEN });
const base = Airtable.base(BASE_ID);

// Utility: Sleep function for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Title case
const toTitleCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Get next RapidAPI key (rotate through keys for rate limit distribution)
 */
function getNextRapidAPIKey(): string {
  const key = RAPIDAPI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % RAPIDAPI_KEYS.length;
  return key;
}

/**
 * Fetch artist data from RapidAPI Spotify endpoint using native https
 */
async function fetchSpotifyArtist(artistId: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Use the exact key from the working test
    const apiKey = '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7';
    
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
          'Content-Length': requestBody.length
        }
      };

      const result: any = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          
          // Handle rate limiting (429)
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers['retry-after'] as string || '60');
            reject(new Error(`RATE_LIMIT:${retryAfter}`));
            return;
          }

          // Handle not found (404)
          if (res.statusCode === 404) {
            resolve(null);
            return;
          }

          // Handle other errors
          if (res.statusCode !== 200) {
            reject(new Error(`RapidAPI error: ${res.statusCode} ${res.statusMessage}`));
            return;
          }

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              
              // Debug: Show what we got
              console.log('🔍 Raw response data keys:', Object.keys(parsed));
              if (parsed.data) {
                console.log('🔍 parsed.data keys:', Object.keys(parsed.data));
                console.log('🔍 Has stats?', !!parsed.data.stats);
                console.log('🔍 Has relatedContent?', !!parsed.data.relatedContent);
              }
              
              if (parsed.error) {
                reject(new Error(`API returned error: ${JSON.stringify(parsed)}`));
              } else {
                resolve(parsed);
              }
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(requestBody);
        req.end();
      });

      if (result === null) {
        return null; // Artist not found
      }

      return result.data;
      
    } catch (error: any) {
      // Handle rate limiting
      if (error.message?.startsWith('RATE_LIMIT:')) {
        const retryAfter = parseInt(error.message.split(':')[1]);
        console.log(`⚠️  Rate limited (key ${currentKeyIndex}). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue; // Retry with next key
      }

      if (attempt === retries) {
        throw error; // Final attempt failed
      }
      console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
      await sleep(2000 * attempt); // Exponential backoff: 2s, 4s, 6s
    }
  }
}

/**
 * Fetch artist albums from RapidAPI Spotify81 endpoint using native https
 */
async function fetchArtistAlbums(artistId: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const apiKey = getNextRapidAPIKey();
    
    try {
      const options = {
        hostname: 'spotify81.p.rapidapi.com',
        port: 443,
        path: `/artist_albums?id=${artistId}&offset=0&limit=100`,
        method: 'GET',
        headers: {
          'X-Rapidapi-Key': apiKey,
          'X-Rapidapi-Host': 'spotify81.p.rapidapi.com'
        }
      };

      const result: any = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          
          // Handle rate limiting (429)
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers['retry-after'] as string || '60');
            reject(new Error(`RATE_LIMIT:${retryAfter}`));
            return;
          }

          // Handle not found (404)
          if (res.statusCode === 404) {
            resolve(null);
            return;
          }

          // Handle other errors
          if (res.statusCode !== 200) {
            reject(new Error(`RapidAPI error: ${res.statusCode} ${res.statusMessage}`));
            return;
          }

          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error('Failed to parse JSON response'));
            }
          });
        });

        req.on('error', reject);
        req.end();
      });

      return result;
      
    } catch (error: any) {
      // Handle rate limiting
      if (error.message?.startsWith('RATE_LIMIT:')) {
        const retryAfter = parseInt(error.message.split(':')[1]);
        console.log(`⚠️  Rate limited (albums). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue; // Retry with next key
      }

      if (attempt === retries) {
        throw error; // Final attempt failed
      }
      console.log(`⚠️  Albums attempt ${attempt} failed: ${error.message}`);
      await sleep(2000 * attempt); // Exponential backoff
    }
  }
}

/**
 * Extract genres from artist biography or profile
 */
function extractGenres(artistData: any): string {
  // Try to parse genres from biography
  const biography = artistData.artistUnion?.profile?.biography?.text || '';
  
  // Simple extraction - look for common genre keywords in biography
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
  
  return foundGenres.slice(0, 5).join(', '); // Limit to 5 genres
}

/**
 * Update tracking record with checked artist info
 */
async function updateTrackingRecord(spotifyId: string, artistName: string) {
  try {
    // Use tracking base
    const trackingBase = Airtable.base(TRACKING_BASE_ID);
    
    // Fetch current tracking record
    const trackingRecord = await trackingBase(TRACKING_TABLE_ID).find(TRACKING_RECORD_ID);
    
    const checkedIds = trackingRecord.get('Checked Ids') as string || '';
    const checkedUrls = trackingRecord.get('Checked Urls') as string || '';
    const checkedNames = trackingRecord.get('Checked Names') as string || '';
    
    // Parse existing values
    const idsArray = checkedIds ? checkedIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    const urlsArray = checkedUrls ? checkedUrls.split(',').map(s => s.trim()).filter(Boolean) : [];
    const namesArray = checkedNames ? checkedNames.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    // Check if artist already tracked
    if (idsArray.includes(spotifyId)) {
      return; // Already tracked, skip
    }
    
    // Add new artist info
    idsArray.push(spotifyId);
    urlsArray.push(`https://open.spotify.com/artist/${spotifyId}`);
    namesArray.push(artistName.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' '));
    
    // Update tracking record
    await trackingBase(TRACKING_TABLE_ID).update(TRACKING_RECORD_ID, {
      'Checked Ids': idsArray.join(', '),
      'Checked Urls': urlsArray.join(', '),
      'Checked Names': namesArray.join(', ')
    });
    
    console.log(`📝 Updated tracking record with ${artistName}`);
  } catch (error: any) {
    console.error(`⚠️  Failed to update tracking record:`, error.message);
  }
}

/**
 * Extract external links and map to social media fields
 */
function extractExternalLinks(artist: any): any {
  const externalLinks = artist.profile?.externalLinks?.items || [];
  const socialLinks: any = {};
  
  // Map external link names to field names
  const linkMapping: { [key: string]: string } = {
    'INSTAGRAM': 'Soc Instagram Url',
    'FACEBOOK': 'Soc Facebook',
    'YOUTUBE': 'Soc Youtube',
    'TIKTOK': 'Soc Tiktok',
    'BANDSINTOWN': 'Soc Bandsintown',
    'TWITTER': 'Soc Twitter',
    'SHAZAM': 'Soc Shazam',
    'APPLE_MUSIC': 'Soc Apple Music Url',
    'WEBSITE': 'Soc Website',
    'AMAZON_MUSIC': 'Soc Amazon Music',
    'CHARTMETRIC': 'Soc Chartmetric',
    'SOUNDCLOUD': 'Soc Soundcloud',
    'WIKIPEDIA': 'Soc Wikipedia',
    'MUSICBRAINZ': 'Soc Musicbrainz',
    'SONGKICK': 'Soc Songkick',
    'DEEZER': 'Soc Deezer',
    'ITUNES': 'Soc Itunes',
    'LASTFM': 'Soc Lastfm',
    'GOOGLE_TRENDS': 'Soc Googletrends',
    'PANDORA': 'Soc Pandora',
    'TIDAL': 'Soc Tidal',
    'IMDB': 'Soc IMDb',
    'IHEARTRADIO': 'Soc Iheartradio',
    'DISCOGS': 'Soc Discogs',
    'BEATPORT': 'Soc Beatport',
    'AUDIOMACK': 'Soc Audiomack',
    'AMAZON_STORE': 'Soc Amazon Store'
  };
  
  for (const link of externalLinks) {
    const name = link.name?.toUpperCase();
    const url = link.url;
    
    if (name && url && linkMapping[name]) {
      socialLinks[linkMapping[name]] = url;
    }
  }
  
  return socialLinks;
}

/**
 * Process related artists and create research records for new ones
 */
async function processRelatedArtists(relatedArtists: any[], sourceArtistName: string) {
  console.log(`\n🔄 Processing ${relatedArtists.length} related artists for ${sourceArtistName}...`);
  
  if (!relatedArtists || relatedArtists.length === 0) return;

  const trackingBase = Airtable.base(TRACKING_BASE_ID);
  const researchBase = Airtable.base('appBFMUGXqbFbc1Jg'); // HB | Research | Music Artists
  
  console.log(`   📥 Fetching tracking record...`);
  // Get tracking record to check which artists we've already processed
  const trackingRecord = await trackingBase(TRACKING_TABLE_ID).find(TRACKING_RECORD_ID);
  const checkedIds = (trackingRecord.get('Checked Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
  
  console.log(`   ✅ Found ${checkedIds.length} already checked IDs`);
  
  let createdCount = 0;
  let skippedCount = 0;
  
  for (const relatedArtist of relatedArtists) {
    const artistId = relatedArtist.id;
    const artistName = relatedArtist.profile?.name;
    
    if (!artistId || !artistName) continue;
    
    // 1. Skip if already in tracking "Checked Ids"
    if (checkedIds.includes(artistId)) {
      skippedCount++;
      continue;
    }
    
    // 2. Check if already exists in Profiles table "Soc Spotify Id"
    try {
      const existingProfile = await base(TABLE_ID)
        .select({
          filterByFormula: `{Soc Spotify Id} = '${artistId}'`,
          maxRecords: 1
        })
        .firstPage();
      
      if (existingProfile.length > 0) {
        skippedCount++;
        continue;
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check Profiles for ${artistName}, continuing...`);
    }
    
    // 3. Check if already exists in Research table "Soc Spotify Id"
    try {
      const existingResearch = await researchBase('tbldc6ULyrhzRosvR')
        .select({
          filterByFormula: `{Soc Spotify Id} = '${artistId}'`,
          maxRecords: 1
        })
        .firstPage();
      
      if (existingResearch.length > 0) {
        skippedCount++;
        continue;
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check Research for ${artistName}, continuing...`);
    }
    
    try {
      // Get avatar image URL
      const avatarSources = relatedArtist.visuals?.avatarImage?.sources || [];
      const imageUrl = avatarSources.length > 0 ? avatarSources[0].url : '';
      
      // Create research record (only if not found in any of the 3 places)
      const newRecord: any = {
        'Name': artistName,
        'Status': 'Todo',
        'Soc Spotify Url': `https://open.spotify.com/artist/${artistId}`,
        'Soc Spotify Id': artistId,
        'Found Details': `Related artist to ${sourceArtistName}`
      };
      
      if (imageUrl) {
        newRecord['Image Url'] = imageUrl;
        // Add as attachment
        newRecord['Image'] = [{
          url: imageUrl
        }];
      }
      
      await researchBase('tbldc6ULyrhzRosvR').create(newRecord);
      createdCount++;
      
      console.log(`   ✨ Created research record for: ${artistName}`);
      
      // Small delay to avoid rate limits
      await sleep(100);
      
    } catch (error: any) {
      console.error(`   ⚠️  Failed to create research record for ${artistName}:`, error.message);
    }
  }
  
  if (createdCount > 0) {
    console.log(`🎯 Created ${createdCount} new research records, skipped ${skippedCount} existing`);
  } else {
    console.log(`✅ All ${skippedCount} related artists already exist - no new records created`);
  }
}

/**
 * Process artist albums and create album records for new ones
 */
async function processAlbums(artistSpotifyId: string, artistName: string, profileRecordId: string, albumsCount: number) {
  console.log(`\n💿 Checking albums for ${artistName}...`);
  
  try {
    // Get profile record to check existing album IDs
    const profileRecord = await base(TABLE_ID).find(profileRecordId);
    const profileAlbumIds = (profileRecord.get('Soc SP Album Release Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    
    // Skip if count matches - no new albums
    if (profileAlbumIds.length === albumsCount) {
      console.log(`   ✅ Album count matches (${albumsCount}) - skipping album processing`);
      return;
    }
    
    console.log(`   📀 Album count changed (${profileAlbumIds.length} → ${albumsCount}) - fetching albums...`);
    const albumsData = await fetchArtistAlbums(artistSpotifyId);
    
    if (!albumsData || !albumsData.data?.artist?.discography?.albums?.items) {
      console.log(`   ⚠️  No albums data found`);
      return;
    }
    
    const albums = albumsData.data.artist.discography.albums.items;
    console.log(`   📀 Found ${albums.length} album groups`);
    
    const trackingBase = Airtable.base(TRACKING_BASE_ID);
    const albumsBase = Airtable.base(ALBUMS_BASE_ID);
    
    // Get tracking record to check which albums we've already processed
    const trackingRecord = await trackingBase(TRACKING_TABLE_ID).find(ALBUMS_TRACKING_RECORD_ID);
    const checkedIds = (trackingRecord.get('Checked Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const checkedUrls = (trackingRecord.get('Checked Urls') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const checkedNames = (trackingRecord.get('Checked Names') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    
    // Use profileAlbumIds already fetched above
    
    let createdCount = 0;
    let skippedCount = 0;
    
    const newAlbumIds: string[] = [];
    const newAlbumUrls: string[] = [];
    const newAlbumNames: string[] = [];
    
    for (const albumGroup of albums) {
      // Each album group can have multiple releases
      const releases = albumGroup.releases?.items || [];
      
      for (const album of releases) {
        const albumId = album.id;
        const albumName = album.name;
        const albumType = album.type; // ALBUM, SINGLE, etc.
        const releaseDate = album.date?.isoString;
        const releaseYear = album.date?.year?.toString();
        const coverArtUrl = album.coverArt?.sources?.[0]?.url;
        const albumUrl = album.sharingInfo?.shareUrl;
        const trackCount = album.tracks?.totalCount?.toString();
        
        if (!albumId || !albumName) continue;
        
        // Check #1: Skip if album ID is in profile's "Soc SP Album Release Ids"
        if (profileAlbumIds.includes(albumId)) {
          skippedCount++;
          continue;
        }
        
        // Check #2: Skip if album ID is in tracking "Checked Ids"
        if (checkedIds.includes(albumId)) {
          skippedCount++;
          continue;
        }
        
        // Check #3: Skip if album already exists in Albums table
        try {
          const existingAlbum = await albumsBase(ALBUMS_TABLE_ID)
            .select({
              filterByFormula: `{Spotify Album Id} = '${albumId}'`,
              maxRecords: 1
            })
            .firstPage();
          
          if (existingAlbum.length > 0) {
            skippedCount++;
            continue;
          }
        } catch (error) {
          console.log(`   ⚠️  Could not check Albums table for ${albumName}, continuing...`);
        }
        
        // Create album record
        try {
          const albumRecord: any = {
            'Album Name': albumName,
            'Artist Name': artistName,
            'Status': 'Todo',
            'Spotify Album Id': albumId,
            'Spotify Artist Id': artistSpotifyId,
            'Spotify Artist Name': artistName,
            'Spotify Type': albumType.charAt(0).toUpperCase() + albumType.slice(1).toLowerCase()
          };
          
          if (coverArtUrl) {
            albumRecord['Cover Art Url'] = coverArtUrl;
            albumRecord['Cover Art'] = [{ url: coverArtUrl }];
          }
          
          if (albumUrl) {
            albumRecord['Spotify Album Url'] = albumUrl;
          }
          
          if (releaseDate) {
            albumRecord['Release Date'] = releaseDate;
          }
          
          if (releaseYear) {
            albumRecord['Release Year'] = releaseYear;
          }
          
          if (trackCount) {
            albumRecord['Track Count'] = trackCount;
          }
          
          await albumsBase(ALBUMS_TABLE_ID).create(albumRecord);
          createdCount++;
          
          // Track for updating profile and tracking records
          newAlbumIds.push(albumId);
          newAlbumUrls.push(albumUrl || '');
          newAlbumNames.push(albumName);
          
          console.log(`   ✨ Created album: ${albumName} (${releaseYear})`);
          
          // Small delay to avoid rate limits
          await sleep(100);
          
        } catch (error: any) {
          console.error(`   ⚠️  Failed to create album ${albumName}:`, error.message);
        }
      }
    }
    
    // Step Two: Update profile record's "Soc SP Album Release Ids"
    if (newAlbumIds.length > 0) {
      const updatedAlbumIds = [...profileAlbumIds, ...newAlbumIds].join(',');
      await base(TABLE_ID).update(profileRecordId, {
        'Soc SP Album Release Ids': updatedAlbumIds
      });
      console.log(`   📝 Updated profile with ${newAlbumIds.length} new album IDs`);
    }
    
    // Step Three: Update tracking record
    if (newAlbumIds.length > 0) {
      const updatedCheckedIds = [...checkedIds, ...newAlbumIds].join(',');
      const updatedCheckedUrls = [...checkedUrls, ...newAlbumUrls].filter(Boolean).join(',');
      const updatedCheckedNames = [...checkedNames, ...newAlbumNames].join(',');
      
      await trackingBase(TRACKING_TABLE_ID).update(ALBUMS_TRACKING_RECORD_ID, {
        'Checked Ids': updatedCheckedIds,
        'Checked Urls': updatedCheckedUrls,
        'Checked Names': updatedCheckedNames
      });
      console.log(`   ✅ Updated tracking record with ${newAlbumIds.length} albums`);
    }
    
    if (createdCount > 0) {
      console.log(`🎯 Created ${createdCount} new album records, skipped ${skippedCount} existing`);
    } else {
      console.log(`✅ All albums already exist - no new records created (skipped ${skippedCount})`);
    }
    
  } catch (error: any) {
    console.error(`   ❌ Error processing albums:`, error.message);
  }
}

/**
 * Process concert artists and create research records for new artists
 */
async function processConcertArtists(concertArtists: any[], concertTitle: string) {
  if (!concertArtists || concertArtists.length === 0) return;

  const trackingBase = Airtable.base(TRACKING_BASE_ID);
  const researchBase = Airtable.base('appBFMUGXqbFbc1Jg'); // HB | Research | Music Artists
  
  // Get tracking record to check which artists we've already processed
  const trackingRecord = await trackingBase(TRACKING_TABLE_ID).find(TRACKING_RECORD_ID);
  const checkedIds = (trackingRecord.get('Checked Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
  
  let createdCount = 0;
  
  for (const artist of concertArtists) {
    const artistId = artist.id;
    const artistName = artist.profile?.name;
    
    if (!artistId || !artistName) continue;
    
    // 1. Skip if already in tracking "Checked Ids"
    if (checkedIds.includes(artistId)) {
      continue;
    }
    
    // 2. Check if already exists in Profiles table "Soc Spotify Id"
    try {
      const existingProfile = await base(TABLE_ID)
        .select({
          filterByFormula: `{Soc Spotify Id} = '${artistId}'`,
          maxRecords: 1
        })
        .firstPage();
      
      if (existingProfile.length > 0) {
        continue;
      }
    } catch (error) {
      // Continue if check fails
    }
    
    // 3. Check if already exists in Research table "Soc Spotify Id"
    try {
      const existingResearch = await researchBase('tbldc6ULyrhzRosvR')
        .select({
          filterByFormula: `{Soc Spotify Id} = '${artistId}'`,
          maxRecords: 1
        })
        .firstPage();
      
      if (existingResearch.length > 0) {
        continue;
      }
    } catch (error) {
      // Continue if check fails
    }
    
    try {
      // Create research record (only if not found in any of the 3 places)
      const newRecord: any = {
        'Name': artistName,
        'Status': 'Todo',
        'Soc Spotify Url': `https://open.spotify.com/artist/${artistId}`,
        'Soc Spotify Id': artistId,
        'Found Details': `Artist from concert: ${concertTitle}`
      };
      
      await researchBase('tbldc6ULyrhzRosvR').create(newRecord);
      createdCount++;
      
      console.log(`      🎤 Created research record for concert artist: ${artistName}`);
      
      // Small delay to avoid rate limits
      await sleep(100);
      
    } catch (error: any) {
      console.error(`      ⚠️  Failed to create research record for ${artistName}:`, error.message);
    }
  }
  
  if (createdCount > 0) {
    console.log(`   🎯 Created ${createdCount} new artist research records from concert`);
  }
}

/**
 * Process artist concerts and create concert records for new ones
 */
async function processConcerts(concerts: any[], artistName: string, artistSpotifyId: string, profileRecordId: string) {
  if (!concerts || concerts.length === 0) {
    return;
  }
  
  console.log(`\n🎫 Processing ${concerts.length} concerts for ${artistName}...`);
  
  try {
    const trackingBase = Airtable.base(TRACKING_BASE_ID);
    const concertsBase = Airtable.base(CONCERTS_BASE_ID);
    
    // Get tracking record to check which concerts we've already processed
    const trackingRecord = await trackingBase(TRACKING_TABLE_ID).find(CONCERTS_TRACKING_RECORD_ID);
    const checkedIds = (trackingRecord.get('Checked Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const checkedUrls = (trackingRecord.get('Checked Urls') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const checkedNames = (trackingRecord.get('Checked Names') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    
    // Get profile record's concert IDs
    const profileRecord = await base(TABLE_ID).find(profileRecordId);
    const profileConcertIds = (profileRecord.get('Soc SP Concert Ids') as string || '').split(',').map(s => s.trim()).filter(Boolean);
    
    let createdCount = 0;
    let skippedCount = 0;
    
    const newConcertIds: string[] = [];
    const newConcertUrls: string[] = [];
    const newConcertNames: string[] = [];
    
    for (const concert of concerts) {
      const concertId = concert.id;
      const concertTitle = concert.title;
      const concertUrl = concert.uri;
      const category = concert.category;
      const festival = concert.festival;
      const venueName = concert.venue?.name;
      const locationName = concert.venue?.location?.name;
      const latitude = concert.venue?.coordinates?.latitude?.toString();
      const longitude = concert.venue?.coordinates?.longitude?.toString();
      const date = concert.date?.isoString;
      
      // Get all artists for this concert from artists.items array
      const artistsArray = concert.artists?.items || [];
      const artistUrls = artistsArray.map((artist: any) => artist.uri);
      const artistIds = artistsArray.map((artist: any) => artist.id);
      const artistNames = artistsArray.map((artist: any) => artist.profile?.name);
      
      if (!concertId || !concertTitle) continue;
      
      // Check #1: Skip if concert ID is in profile's "Soc SP Concert Ids"
      if (profileConcertIds.includes(concertId)) {
        skippedCount++;
        continue;
      }
      
      // Check #2: Skip if concert ID is in tracking "Checked Ids"
      if (checkedIds.includes(concertId)) {
        skippedCount++;
        continue;
      }
      
      // Check #3: Skip if concert already exists in Concerts table
      try {
        const existingConcert = await concertsBase(CONCERTS_TABLE_ID)
          .select({
            filterByFormula: `{Spotify Id} = '${concertId}'`,
            maxRecords: 1
          })
          .firstPage();
        
        if (existingConcert.length > 0) {
          skippedCount++;
          continue;
        }
      } catch (error) {
        console.log(`   ⚠️  Could not check Concerts table for ${concertTitle}, continuing...`);
      }
      
      // Create concert record
      try {
        // Helper function to title-case strings
        const toTitleCase = (str: string) => {
          if (!str) return str;
          return str.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        };
        
        const concertRecord: any = {
          'Title': toTitleCase(concertTitle),
          'Status': 'Todo',
          'Spotify Id': concertId,
          'Spotify Title': toTitleCase(concertTitle)
        };
        
        if (concertUrl) {
          concertRecord['Spotify Url'] = concertUrl;
        }
        
        if (category) {
          concertRecord['Spotify Category'] = toTitleCase(category);
        }
        
        if (festival !== undefined && festival !== null) {
          // Festival is likely a boolean field
          concertRecord['Spotify Festival'] = festival ? 'Yes' : 'No';
        }
        
        if (venueName) {
          concertRecord['Spotify Venue Name'] = toTitleCase(venueName);
        }
        
        if (locationName) {
          concertRecord['Spotify Location Name'] = toTitleCase(locationName);
        }
        
        if (latitude) {
          concertRecord['Spotify Latitude'] = latitude;
        }
        
        if (longitude) {
          concertRecord['Spotify Longitude'] = longitude;
        }
        
        if (artistUrls.length > 0) {
          concertRecord['Spotify Artist Urls'] = artistUrls.join(',');
        }
        
        if (artistIds.length > 0) {
          concertRecord['Spotify Artist Ids'] = artistIds.join(',');
        }
        
        if (artistNames.length > 0) {
          concertRecord['Spotify Artist Names'] = artistNames.map((name: string) => toTitleCase(name)).join(',');
        }
        
        if (date) {
          // Convert ISO string to date-only format YYYY-MM-DD
          try {
            const dateObj = new Date(date);
            const dateOnly = dateObj.toISOString().split('T')[0];
            concertRecord['Spotify Date'] = dateOnly;
          } catch (e) {
            console.log(`   ⚠️  Could not parse date: ${date}`);
          }
        }
        
        await concertsBase(CONCERTS_TABLE_ID).create(concertRecord);
        createdCount++;
        
        // Track for updating profile and tracking records
        newConcertIds.push(concertId);
        newConcertUrls.push(concertUrl || '');
        newConcertNames.push(concertTitle);
        
        console.log(`   ✨ Created concert: ${concertTitle} (${date ? new Date(date).toLocaleDateString() : 'No date'})`);
        
        // Process concert artists to create research records for new artists
        if (artistsArray && artistsArray.length > 0) {
          await processConcertArtists(artistsArray, concertTitle);
        }
        
        // Small delay to avoid rate limits
        await sleep(100);
        
      } catch (error: any) {
        console.error(`   ⚠️  Failed to create concert ${concertTitle}:`, error.message);
      }
    }
    
    // Step Two: Update profile record's "Soc SP Concert Ids"
    if (newConcertIds.length > 0) {
      const updatedConcertIds = [...profileConcertIds, ...newConcertIds].join(',');
      await base(TABLE_ID).update(profileRecordId, {
        'Soc SP Concert Ids': updatedConcertIds
      });
      console.log(`   📝 Updated profile with ${newConcertIds.length} new concert IDs`);
    }
    
    // Step Three: Update tracking record
    if (newConcertIds.length > 0) {
      const updatedCheckedIds = [...checkedIds, ...newConcertIds].join(',');
      const updatedCheckedUrls = [...checkedUrls, ...newConcertUrls].filter(Boolean).join(',');
      const updatedCheckedNames = [...checkedNames, ...newConcertNames].join(',');
      
      await trackingBase(TRACKING_TABLE_ID).update(CONCERTS_TRACKING_RECORD_ID, {
        'Checked Ids': updatedCheckedIds,
        'Checked Urls': updatedCheckedUrls,
        'Checked Names': updatedCheckedNames
      });
      console.log(`   ✅ Updated tracking record with ${newConcertIds.length} concerts`);
    }
    
    if (createdCount > 0) {
      console.log(`🎯 Created ${createdCount} new concert records, skipped ${skippedCount} existing`);
    } else if (skippedCount > 0) {
      console.log(`✅ All concerts already exist - no new records created (skipped ${skippedCount})`);
    }
    
  } catch (error: any) {
    console.error(`   ❌ Error processing concerts:`, error.message);
  }
}

/**
 * Main processing function to enrich artist data
 */
async function enrichArtist(recordId: string, spotifyId: string, artistName: string, existingFields: any) {
  console.log(`\n📋 Processing: ${artistName} (${spotifyId})`);

  try {
    console.log(`   🔍 Fetching artist data from Spotify...`);
    // Fetch artist data from RapidAPI
    const artistData = await fetchSpotifyArtist(spotifyId);
    console.log(`   ✅ Received artist data`);

    if (!artistData || !artistData.artistUnion) {
      console.log(`❌ Artist not found on Spotify`);
      await base(TABLE_ID).update(recordId, {
        'Soc SP Check': new Date().toISOString().split('T')[0]
      });
      return;
    }

    // Debug: Log full response structure
    console.log(`🔍 Full response keys:`, Object.keys(artistData));
    if (artistData.data) {
      console.log(`🔍 artistData.data keys:`, Object.keys(artistData.data));
    }

    const artist = artistData.artistUnion;
    const stats = artist.stats || {};
    const relatedArtists = artist.relatedContent?.relatedArtists?.items || [];
    const topCities = stats.topCities?.items || [];
    const concerts = artist.goods?.events?.concerts?.items || [];
    
    // Extract counts with correct paths
    const concertsCount = artist.goods?.events?.concerts?.totalCount || 0;
    const popularReleasesAlbumsCount = artist.discography?.popularReleasesAlbums?.totalCount || 0;
    const singlesCount = artist.discography?.singles?.totalCount || 0;
    const compilationsCount = artist.discography?.compilations?.totalCount || 0;
    const albumsCount = artist.discography?.albums?.totalCount || 0;

    // Debug: Log what we received
    console.log(`📊 Stats received:`, JSON.stringify(stats, null, 2));
    console.log(`👥 Related artists count:`, relatedArtists.length);
    console.log(`🌆 Top cities count:`, topCities.length);
    console.log(`🎤 Concerts: ${concertsCount}, Albums: ${albumsCount}, Singles: ${singlesCount}, Compilations: ${compilationsCount}, Popular Releases: ${popularReleasesAlbumsCount}`);
    
    // Update tracking record
    await updateTrackingRecord(spotifyId, artistName);
    
    // Extract external social links
    const externalSocialLinks = extractExternalLinks(artist);
    console.log(`🔗 External links found:`, Object.keys(externalSocialLinks).length);

    // Extract gallery images (640x640 and larger)
    const galleryImages = artist.visuals?.gallery?.items || [];
    const largeImages = galleryImages
      .flatMap((item: any) => item.sources || [])
      .filter((source: any) => source.width >= 640)
      .map((source: any) => source.url)
      .slice(0, 10); // Limit to 10 images

    // Extract avatar images (all sizes)
    const avatarImages = artist.visuals?.avatarImage?.sources || [];
    const avatarUrls = avatarImages.map((source: any) => source.url);

    // Strip HTML from biography
    const rawBiography = artist.profile?.biography?.text || '';
    const plainBiography = rawBiography
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#43;/g, '+');

    // Extract genres from biography
    const genres = extractGenres(artistData);

    // Prepare update fields
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to midnight for date-only field
    
    // Format date as MM.DD.YYYY for running stats
    const dateFormat = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${today.getFullYear()}`;
    
    // Build running stats - only add if today's date doesn't exist
    const existingFollowers = existingFields['Soc SP Stats Running Followers'] || '';
    const existingListeners = existingFields['Soc SP Stats Running Listeners'] || '';
    const existingWorldRank = existingFields['Soc SP Stats Running World Rank'] || '';
    const existingLocations = existingFields['Soc SP Stats Running Top Locations'] || '';
    
    // Check if today's date already exists in running stats
    const hasFollowersToday = existingFollowers.includes(dateFormat);
    const hasListenersToday = existingListeners.includes(dateFormat);
    const hasWorldRankToday = existingWorldRank.includes(dateFormat);
    const hasLocationsToday = existingLocations.includes(dateFormat);
    
    // Append new stats if not already present for today
    const runningFollowers = hasFollowersToday 
      ? existingFollowers 
      : (existingFollowers ? `${existingFollowers}, ` : '') + `${dateFormat} | ${stats.followers || 0}`;
    
    const runningListeners = hasListenersToday 
      ? existingListeners 
      : (existingListeners ? `${existingListeners}, ` : '') + `${dateFormat} | ${stats.monthlyListeners || 0}`;
    
    const runningWorldRank = hasWorldRankToday 
      ? existingWorldRank 
      : (existingWorldRank ? `${existingWorldRank}, ` : '') + `${dateFormat} | ${stats.worldRank || 0}`;
    
    // Build top 5 locations running stats with # separator
    let runningLocations = existingLocations;
    if (!hasLocationsToday && topCities.length > 0) {
      const locationEntries = topCities.slice(0, 5).map((city: any, index: number) => 
        `#${index + 1} | ${city.numberOfListeners} | ${city.city} | ${city.country} | ${city.region}`
      ).join(' ');
      const newEntry = `${dateFormat} ${locationEntries}`;
      runningLocations = existingLocations ? `${existingLocations}, ${newEntry}` : newEntry;
    }
    
    // Build detailed update summary comparing old vs new values
    const changes = [];
    
    // Track what changed
    const oldFollowers = existingFields['Soc SP Follower'] ? parseInt(existingFields['Soc SP Follower']) : null;
    const oldListeners = existingFields['Soc SP Listener'] ? parseInt(existingFields['Soc SP Listener']) : null;
    const oldRank = existingFields['Soc SP Rank'] ? parseInt(existingFields['Soc SP Rank']) : null;
    const oldBio = existingFields['Soc SP About'] || '';
    const oldGalleryUrls = existingFields['Soc SP Gallery Urls'] || '';
    const oldRelatedArtists = existingFields['Soc SP Related Artists'] || '';
    
    // Compare and build change descriptions
    if (stats.followers) {
      if (oldFollowers && oldFollowers !== stats.followers) {
        changes.push(`Followers: ${oldFollowers.toLocaleString()} → ${stats.followers.toLocaleString()}`);
      } else if (!oldFollowers) {
        changes.push(`Followers: ${stats.followers.toLocaleString()} (new)`);
      }
    }
    
    if (stats.monthlyListeners) {
      if (oldListeners && oldListeners !== stats.monthlyListeners) {
        changes.push(`Listeners: ${oldListeners.toLocaleString()} → ${stats.monthlyListeners.toLocaleString()}`);
      } else if (!oldListeners) {
        changes.push(`Listeners: ${stats.monthlyListeners.toLocaleString()} (new)`);
      }
    }
    
    if (stats.worldRank) {
      if (oldRank && oldRank !== stats.worldRank) {
        changes.push(`Rank: ${oldRank} → ${stats.worldRank}`);
      } else if (!oldRank) {
        changes.push(`Rank: ${stats.worldRank} (new)`);
      }
    }
    
    if (plainBiography && plainBiography !== oldBio) {
      if (oldBio) {
        changes.push(`Bio updated`);
      } else {
        changes.push(`Bio added`);
      }
    }
    
    if (largeImages.length > 0) {
      const newGalleryUrls = largeImages.join(', ');
      if (oldGalleryUrls) {
        const oldCount = oldGalleryUrls.split(',').length;
        const newCount = largeImages.length;
        if (oldCount !== newCount) {
          changes.push(`Gallery images: ${oldCount} → ${newCount}`);
        }
      } else {
        changes.push(`Gallery images: ${largeImages.length} added`);
      }
    }
    
    if (topCities.length > 0) {
      changes.push(`Top Cities: ${topCities.length} updated`);
    }
    
    if (relatedArtists.length > 0) {
      const newRelatedIds = relatedArtists.slice(0, 20).map((a: any) => a.id).join(', ');
      if (oldRelatedArtists && oldRelatedArtists !== newRelatedIds) {
        changes.push(`Related Artists: updated (${relatedArtists.length})`);
      } else if (!oldRelatedArtists) {
        changes.push(`Related Artists: ${relatedArtists.length} added`);
      }
    }
    
    // Build the check updates message
    const summaryLine = [
      stats.followers ? `Followers: ${stats.followers.toLocaleString()}` : null,
      stats.monthlyListeners ? `Listeners: ${stats.monthlyListeners.toLocaleString()}` : null,
      stats.worldRank ? `Rank: ${stats.worldRank}` : null,
      topCities.length > 0 ? `Top Cities: ${topCities.length}` : null,
      relatedArtists.length > 0 ? `Related Artists: ${relatedArtists.length}` : null
    ].filter(Boolean).join(', ');
    
    const changesLine = changes.length > 0 ? `Changes: ${changes.join(', ')}` : 'No changes detected';
    const checkUpdates = `${dateFormat}\n${summaryLine}\n${changesLine}`;
    const existingCheckUpdates = existingFields['Soc SP Check Updates'] || '';
    const newCheckUpdates = existingCheckUpdates ? `${existingCheckUpdates}\n\n${checkUpdates}` : checkUpdates;
    
    const updateFields: any = {
      // Basic info
      'Soc SP About': plainBiography,
      'Soc SP Verified': artist.profile?.verified ? 'True' : 'False',
      'Soc SP Type': 'Artist',
      
      // Images
      'Soc SP Gallery Urls': largeImages.join(', '),
      'Soc SP Avatar Image Urls': avatarUrls.join(', '),
      'Soc SP Image': avatarUrls[0] || '', // Primary avatar image
      
      // Stats
      'Soc SP Follower': stats.followers?.toString() || '',
      'Soc SP Listener': stats.monthlyListeners?.toString() || '',
      'Soc SP Popularity': stats.worldRank?.toString() || '',
      'Soc SP Rank': stats.worldRank?.toString() || '',
      
      // Running Stats
      'Soc SP Stats Running Followers': runningFollowers,
      'Soc SP Stats Running Listeners': runningListeners,
      'Soc SP Stats Running World Rank': runningWorldRank,
      'Soc SP Stats Running Top Locations': runningLocations,
      
      // Status and Update Log
      'Soc SP Data Status': stats.followers || stats.monthlyListeners ? 'Updated' : 'Not Found',
      'Soc SP Check Updates': newCheckUpdates,
      
      // Top Cities (up to 4)
      'Soc SP Top Cities 1 Listeners': topCities[0]?.numberOfListeners?.toString() || '',
      'Soc SP Top Cities 1 City': topCities[0]?.city || '',
      'Soc SP Top Cities 1 Country': topCities[0]?.country || '',
      'Soc SP Top Cities 1 Region': topCities[0]?.region || '',
      
      'Soc SP Top Cities 2 Listeners': topCities[1]?.numberOfListeners?.toString() || '',
      'Soc SP Top Cities 2 City': topCities[1]?.city || '',
      'Soc SP Top Cities 2 Country': topCities[1]?.country || '',
      'Soc SP Top Cities 2 Region': topCities[1]?.region || '',
      
      'Soc SP Top Cities 3 Listeners': topCities[2]?.numberOfListeners?.toString() || '',
      'Soc SP Top Cities 3 City': topCities[2]?.city || '',
      'Soc SP Top Cities 3 Country': topCities[2]?.country || '',
      'Soc SP Top Cities 3 Region': topCities[2]?.region || '',
      
      'Soc SP Top Cities 4 Listeners': topCities[3]?.numberOfListeners?.toString() || '',
      'Soc SP Top Cities 4 City': topCities[3]?.city || '',
      'Soc SP Top Cities 4 Country': topCities[3]?.country || '',
      'Soc SP Top Cities 4 Region': topCities[3]?.region || '',
      
      // Related Artists
      'Soc SP Related Artists': relatedArtists.length > 0 
        ? relatedArtists.slice(0, 20).map((a: any) => a.id).join(', ') 
        : '',
      'Soc SP Related Artists Name': relatedArtists.length > 0 
        ? relatedArtists.slice(0, 20).map((a: any) => a.profile?.name || '').filter(Boolean).join(', ') 
        : '',
      
      // Counts
      'Soc SP Concerts': concertsCount.toString(),
      'Soc Spotify Popular Releases Albums Count': popularReleasesAlbumsCount.toString(),
      'Soc Spotify Singles Count': singlesCount.toString(),
      'Soc Spotify Compilations Count': compilationsCount.toString(),
      'Soc Spotify Albums Count': albumsCount.toString(),
      
      // Legacy fields (keeping for compatibility)
      'Soc SP Genres': genres || '',
      'Soc SP Check': today.toISOString().split('T')[0] // YYYY-MM-DD format
    };
    
    // Add external social links ONLY if current field is empty
    for (const [fieldName, url] of Object.entries(externalSocialLinks)) {
      const currentValue = existingFields[fieldName];
      if (!currentValue || currentValue === '') {
        updateFields[fieldName] = url;
      }
    }

    // Update Airtable
    await base(TABLE_ID).update(recordId, updateFields);

    console.log(`✅ Updated: ${artistName}`);
    console.log(`   Followers: ${stats.followers?.toLocaleString() || 'N/A'}`);
    console.log(`   Monthly Listeners: ${stats.monthlyListeners?.toLocaleString() || 'N/A'}`);
    console.log(`   World Rank: ${stats.worldRank || 'N/A'}`);
    console.log(`   Verified: ${artist.profile?.verified ? 'Yes' : 'No'}`);
    console.log(`   Gallery Images: ${largeImages.length}`);
    console.log(`   Avatar Images: ${avatarUrls.length}`);
    console.log(`   Top Cities: ${topCities.length}`);
    console.log(`   Related Artists: ${relatedArtists.length}`);
    
    // Process related artists and create research records
    await processRelatedArtists(relatedArtists, artistName);
    
    // Process concerts and create concert records
    await processConcerts(concerts, artistName, spotifyId, recordId);
    
    // Process albums and create album records
    await processAlbums(spotifyId, artistName, recordId, albumsCount);

  } catch (error: any) {
    console.error(`❌ Error processing ${artistName}:`, error.message);
    
    // Update with error status
    const today = new Date();
    const dateFormat = `${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${today.getFullYear()}`;
    const existingCheckUpdates = existingFields['Soc SP Check Updates'] || '';
    const errorUpdate = `${dateFormat}\nError: ${error.message}`;
    const newCheckUpdates = existingCheckUpdates ? `${existingCheckUpdates}\n\n${errorUpdate}` : errorUpdate;
    
    await base(TABLE_ID).update(recordId, {
      'Soc SP Check': new Date().toISOString().split('T')[0],
      'Soc SP Data Status': 'Error',
      'Soc SP Check Updates': newCheckUpdates
    });
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🎵 Spotify Artist Enrichment Started');
  console.log('🔑 Using RapidAPI with key rotation (11 keys)');
  console.log(`📊 Base: ${BASE_ID}`);
  console.log(`📋 Table: ${TABLE_ID}`);
  console.log(`👁️  View: ${VIEW_NAME}`);
  if (LIMIT) console.log(`🔢 Limit: ${LIMIT} records`);
  console.log('');

  try {
    // Fetch records from Airtable view
    const records: any[] = [];
    const selectOptions: any = { view: VIEW_NAME };
    if (LIMIT) selectOptions.maxRecords = LIMIT;
    
    await base(TABLE_ID)
      .select(selectOptions)
      .eachPage((pageRecords, fetchNextPage) => {
        records.push(...pageRecords);
        fetchNextPage();
      });

    console.log(`📋 Found ${records.length} records to process\n`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of records) {
      const spotifyId = record.get('Soc Spotify Id') as string;
      const artistName = record.get('Name') || record.get('Profile Name') || 'Unknown Artist';

      if (!spotifyId) {
        console.log(`⏭️  Skipping ${artistName}: No Spotify ID`);
        skipped++;
        continue;
      }

      try {
        // Get existing field values to check which social fields are empty
        const existingFields: any = {};
        const socialFields = [
          'Soc Instagram Url', 'Soc Facebook', 'Soc Youtube', 'Soc Tiktok',
          'Soc Bandsintown', 'Soc Twitter', 'Soc Shazam', 'Soc Apple Music Url',
          'Soc Website', 'Soc Amazon Music', 'Soc Chartmetric', 'Soc Soundcloud',
          'Soc Wikipedia', 'Soc Musicbrainz', 'Soc Songkick', 'Soc Deezer',
          'Soc Itunes', 'Soc Lastfm', 'Soc Googletrends', 'Soc Pandora',
          'Soc Tidal', 'Soc IMDb', 'Soc Iheartradio', 'Soc Discogs',
          'Soc Beatport', 'Soc Audiomack', 'Soc Amazon Store'
        ];
        
        for (const field of socialFields) {
          existingFields[field] = record.get(field) || '';
        }
        
        await enrichArtist(record.id, spotifyId, artistName, existingFields);
        processed++;
      } catch (error) {
        errors++;
      }

      // Rate limiting: 600ms delay between artists (prevents hitting 1000 RPH limit)
      // 1000 requests/hour = 16.67 requests/minute = ~3.6 seconds/request safe
      // With 11 keys rotating: 600ms is safe
      await sleep(600);
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

// Run
main();
