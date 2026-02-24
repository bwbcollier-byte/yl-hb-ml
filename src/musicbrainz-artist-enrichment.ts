import dotenv from 'dotenv';
import Airtable from 'airtable';
import fetch from 'node-fetch';

dotenv.config();

// Configuration
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TABLE_ID = process.env.AIRTABLE_TABLE_ID!;
const VIEW_NAME = process.env.AIRTABLE_VIEW_NAME || 'Musicbrainz';
const AUDIODB_API_KEY = process.env.AUDIODB_API_KEY || '2';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

// Albums table configuration
const ALBUMS_BASE_ID = 'appYXhhXgVkSblLdl';
const ALBUMS_TABLE_ID = 'tblYaSMImRbOr9CX3';

// Initialize Airtable
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(BASE_ID);
const albumsBase = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(ALBUMS_BASE_ID);

// Rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Batch update settings
const BATCH_SIZE = 10;
// Tracks fields that don't exist in Airtable - persists across all records to avoid retrying known bad fields
const globalSkippedFields = new Set<string>();

// User-Agent for MusicBrainz (required)
const USER_AGENT = 'MusicBrainzEnrichment/1.0 (contact@example.com)';

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
  area?: {
    name?: string;
  };
  'begin-area'?: {
    name?: string;
  };
  'end-area'?: {
    name?: string;
  };
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
    url?: {
      resource: string;
    };
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
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    country?: string;
    status?: string;
    barcode?: string;
    'label-info'?: Array<{
      label?: {
        name?: string;
      };
    }>;
    media?: Array<{
      format?: string;
      'track-count'?: number;
    }>;
    relations?: Array<{
      type: string;
      url?: {
        resource: string;
      };
    }>;
  }>;
  'release-groups'?: Array<{
    id: string;
    title: string;
    'first-release-date'?: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
  }>;
}

interface AudioDBArtist {
  idArtist: string;
  strArtist: string;
  strArtistAlternate?: string;
  strLabel?: string;
  intFormedYear?: string;
  intBornYear?: string;
  intDiedYear?: string;
  strStyle?: string;
  strGenre?: string;
  strMood?: string;
  strWebsite?: string;
  strFacebook?: string;
  strTwitter?: string;
  strBiographyEN?: string;
  strGender?: string;
  intMembers?: string;
  strCountry?: string;
  strCountryCode?: string;
  strArtistThumb?: string;
  strArtistLogo?: string;
  strArtistCutout?: string;
  strArtistBanner?: string;
  strArtistFanart?: string;
  strMusicBrainzID?: string;
}

/**
 * Fetch artist data from MusicBrainz API
 */
async function fetchMusicBrainzArtist(mbid: string): Promise<MusicBrainzArtist | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=aliases+tags+ratings+url-rels+artist-rels+release-groups&fmt=json`;
    
    console.log(`  🔍 Fetching MusicBrainz data for ${mbid}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
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

/**
 * Fetch artist data from TheAudioDB API
 */
async function fetchAudioDBArtist(mbid: string): Promise<AudioDBArtist | null> {
  try {
    const url = `https://www.theaudiodb.com/api/v1/json/${AUDIODB_API_KEY}/artist-mb.php?i=${mbid}`;
    
    console.log(`  🎵 Fetching TheAudioDB data...`);
    
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  ⚠️  TheAudioDB API error: ${response.status} (may require premium key)`);
      return null;
    }

    const data = await response.json() as { artists: AudioDBArtist[] | null };
    
    // Rate limit: 2 calls per second
    await sleep(500);
    
    return data.artists?.[0] || null;
  } catch (error) {
    console.error(`  ❌ Error fetching TheAudioDB data:`, error);
    return null;
  }
}

/**
 * Extract social media URLs from MusicBrainz relations
 */
function extractSocialUrls(relations?: MusicBrainzArtist['relations']): Record<string, string> {
  const urls: Record<string, string> = {};
  
  if (!relations) return urls;

  for (const rel of relations) {
    // Exclude certain types we don't want
    const excludedTypes = ['purchase for download', 'review', 'online community', 'blog', 'image', 'discography entry', 'get the music'];
    if (excludedTypes.includes(rel.type)) {
      continue;
    }

    const url = rel.url?.resource;
    if (!url) continue;

    const urlLower = url.toLowerCase();

    // Map URLs to Airtable fields
    if (urlLower.includes('instagram.com')) {
      urls['Soc Instagram Url'] = url;
    } else if (urlLower.includes('facebook.com')) {
      urls['Soc Facebook'] = url;
    } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      if (urlLower.includes('music.youtube')) {
        urls['Soc Youtube Music'] = url;
      } else {
        urls['Soc Youtube'] = url;
      }
    } else if (urlLower.includes('tiktok.com')) {
      urls['Soc Tiktok'] = url;
    } else if (urlLower.includes('bandsintown.com')) {
      urls['Soc Bandsintown'] = url;
    } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      urls['Soc Twitter'] = url;
    } else if (urlLower.includes('shazam.com')) {
      urls['Soc Shazam'] = url;
    } else if (urlLower.includes('music.apple.com')) {
      urls['Soc Apple Music Url'] = url;
    } else if (urlLower.includes('amazon.com') && urlLower.includes('music')) {
      urls['Soc Amazon Music'] = url;
    } else if (urlLower.includes('amazon.com') && urlLower.includes('store')) {
      urls['Soc Amazon Store'] = url;
    } else if (urlLower.includes('chartmetric.com')) {
      urls['Soc Chartmetric'] = url;
    } else if (urlLower.includes('soundcloud.com')) {
      urls['Soc Soundcloud'] = url;
    } else if (urlLower.includes('wikipedia.org')) {
      urls['Soc Wikipedia'] = url;
    } else if (urlLower.includes('wikidata.org')) {
      urls['Soc Wikidata'] = url;
    } else if (urlLower.includes('songkick.com')) {
      urls['Soc Songkick'] = url;
    } else if (urlLower.includes('deezer.com')) {
      urls['Soc Deezer'] = url;
    } else if (urlLower.includes('itunes.apple.com')) {
      urls['Soc Itunes'] = url;
    } else if (urlLower.includes('last.fm')) {
      urls['Soc Lastfm'] = url;
    } else if (urlLower.includes('bandcamp.com')) {
      urls['Soc Bandcamp'] = url;
    } else if (urlLower.includes('imvdb.com')) {
      urls['Soc IMVDb'] = url;
    } else if (urlLower.includes('themoviedb.org') || urlLower.includes('tmdb.org')) {
      urls['Soc TMDb'] = url;
    } else if (urlLower.includes('trends.google.com')) {
      urls['Soc Googletrends'] = url;
    } else if (urlLower.includes('pandora.com')) {
      urls['Soc Pandora'] = url;
    } else if (urlLower.includes('tidal.com')) {
      urls['Soc Tidal'] = url;
    } else if (urlLower.includes('imdb.com')) {
      urls['Soc IMDb'] = url;
    } else if (urlLower.includes('iheart.com') || urlLower.includes('iheartradio.com')) {
      urls['Soc Iheartradio'] = url;
    } else if (urlLower.includes('discogs.com')) {
      urls['Soc Discogs'] = url;
    } else if (urlLower.includes('beatport.com')) {
      urls['Soc Beatport'] = url;
    } else if (urlLower.includes('audiomack.com')) {
      urls['Soc Audiomack'] = url;
    } else if (urlLower.includes('myspace.com')) {
      urls['Soc Myspace'] = url;
    } else if (urlLower.includes('vevo.com')) {
      urls['Soc Vevo'] = url;
    } else if (urlLower.includes('genius.com')) {
      urls['Soc Genius'] = url;
    } else if (urlLower.includes('setlist.fm')) {
      urls['Soc Setlistfm'] = url;
    } else if (urlLower.includes('musixmatch.com')) {
      urls['Soc Musixmatch'] = url;
    } else if (urlLower.includes('qobuz.com')) {
      urls['Soc Qobuz'] = url;
    } else if (urlLower.includes('napster.com')) {
      urls['Soc Napster'] = url;
    // } else if (urlLower.includes('spotify.com')) {
    //   urls['Soc Spotify Artist Id'] = url; // Field doesn't exist in Airtable
    } else if (urlLower.includes('allmusic.com')) {
      urls['Soc AMG Artist Id'] = url;
      urls['Soc Allmusic'] = url;
    } else if (rel.type === 'official homepage' || (!urls['Soc Website'] && urlLower.match(/^https?:\/\/(?:www\.)?[a-z0-9-]+\.[a-z]{2,}/))) {
      // Official homepage or generic website
      if (!urls['Soc Website']) {
        urls['Soc Website'] = url;
      }
    }
  }

  return urls;
}

/**
 * Extract artist relationships (members, collaborators, etc.)
 */
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

    if (relType === 'member of band' || relType === 'member' || relType === 'founder') {
      if (!members.includes(artistName)) {
        members.push(artistName);
      }
    } else if (relType === 'collaboration') {
      if (!collaborators.includes(artistName)) {
        collaborators.push(artistName);
      }
    } else if (relType === 'supporting musician' || relType === 'involved with' || relType === 'part of') {
      if (!associated.includes(artistName)) {
        associated.push(artistName);
      }
    }
  }

  return { members, associated, collaborators };
}

/**
 * Process a single artist record
 */
async function enrichArtist(recordId: string, mbid: string, artistName: string, existingFields: any): Promise<{ id: string; fields: any } | null> {
  console.log(`\n📋 Processing: ${artistName}`);
  console.log(`   MBID: ${mbid}`);

  // Fetch MusicBrainz data
  const mbData = await fetchMusicBrainzArtist(mbid);
  if (!mbData) {
    console.log(`  ⚠️  Skipping - no MusicBrainz data found`);
    return null;
  }

  // Fetch TheAudioDB data (optional, may require premium key)
  const audioData = await fetchAudioDBArtist(mbid);

  // Extract social URLs
  const socialUrls = extractSocialUrls(mbData.relations);

  // Extract artist relationships
  const relationships = extractArtistRelationships(mbData.relations);

  // Prepare update fields
  const updateFields: any = {
    'Check Musicbrainz': new Date().toISOString().split('T')[0], // YYYY-MM-DD format
  };

  // MusicBrainz fields
  if (mbData['life-span']?.begin) {
    const dateString = mbData['life-span'].begin;
    
    // Always extract the year
    const yearMatch = dateString.match(/^(\d{4})/);
    if (yearMatch) {
      updateFields['Date Formed Born Year'] = yearMatch[1];
    }
    
    // Only add FULL dates (YYYY-MM-DD) - reject year-only or year-month formats
    let isoDate = null;
    
    // Handle DD/M/YYYY or D/M/YYYY format
    const ddmmyyyyMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, '0');
      const month = ddmmyyyyMatch[2].padStart(2, '0');
      const year = ddmmyyyyMatch[3];
      isoDate = `${year}-${month}-${day}`;
    }
    // Handle YYYY-MM-DD format (must have day)
    else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      isoDate = dateString;
    }
    // Reject year-only (YYYY) or year-month (YYYY-MM) formats
    
    if (isoDate) {
      updateFields['Date Formed Born'] = isoDate;
      updateFields['Soc MB Birthdate'] = isoDate;
    }
  }

  if (mbData.type) {
    updateFields['Soc MB Artist Type'] = mbData.type;
  }

  if (mbData.gender) {
    updateFields['Soc MB Gender'] = mbData.gender;
  }

  if (mbData.country) {
    updateFields['Soc MB Country'] = mbData.country;
    // Location Country might be a linked field, skip it for now
    // updateFields['Location Country'] = mbData.country;
  }

  if (mbData.area?.name) {
    updateFields['Soc MB Area'] = mbData.area.name;
  }

  if (mbData.disambiguation) {
    updateFields['Soc MB Disambiguation'] = mbData.disambiguation;
  }

  // New fields
  if (mbData['sort-name']) {
    updateFields['Soc MB Sort Name'] = mbData['sort-name'];
  }

  if (mbData.isni && mbData.isni.length > 0) {
    updateFields['Soc MB ISNI Code'] = mbData.isni.join(', ');
  }

  if (mbData.aliases && mbData.aliases.length > 0) {
    const aliases = mbData.aliases
      .map(a => a.name)
      .filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates
      .slice(0, 20) // Limit to 20 aliases
      .join(', ');
    updateFields['Soc MB Aliases'] = aliases;
  }

  // Soc MB Rating field - Field type mismatch in Airtable (needs to be Number type)
  // if (mbData.rating?.value !== undefined) {
  //   const ratingValue = Math.round(mbData.rating.value);
  //   if (ratingValue >= 0 && ratingValue <= 100) {
  //     updateFields['Soc MB Rating'] = ratingValue;
  //   }
  // }

  if (mbData['begin-area']?.name || mbData['end-area']?.name) {
    const areas = [];
    if (mbData['begin-area']?.name) areas.push(mbData['begin-area'].name);
    if (mbData['end-area']?.name) areas.push(mbData['end-area'].name);
    updateFields['Soc MB Begin and end area'] = areas.join(', ');
  }

  if (mbData.tags && mbData.tags.length > 0) {
    const genres = mbData.tags
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(t => {
        // Title case each word
        return t.name.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      })
      .join(', ');
    updateFields['Soc MB Genres'] = genres;
  }

  if (relationships.members.length > 0) {
    updateFields['Soc MB Members'] = relationships.members.join(', ');
  }

  if (relationships.associated.length > 0) {
    updateFields['Soc MB Associated'] = relationships.associated.join(', ');
  }

  if (relationships.collaborators.length > 0) {
    updateFields['Soc MB Collaborators'] = relationships.collaborators.join(', ');
  }

  // TheAudioDB fields (if available)
  if (audioData) {
    console.log(`  ✅ TheAudioDB data found`);
    
    if (audioData.strBiographyEN) {
      updateFields['Soc MB Bio'] = audioData.strBiographyEN;
    }

    if (audioData.strArtistThumb) {
      updateFields['Soc MB Avatar Url'] = audioData.strArtistThumb;
    }

    // Additional TheAudioDB fields if you add columns
    // updateFields['Soc TADB Style'] = audioData.strStyle || '';
    // updateFields['Soc TADB Mood'] = audioData.strMood || '';
    // updateFields['Soc TADB Label'] = audioData.strLabel || '';
  } else {
    console.log(`  ℹ️  No TheAudioDB data (may require premium API key)`);
  }

  // Update social URLs - only if they are currently empty (don't overwrite existing data)
  console.log(`  🔗 Social URLs extracted: ${Object.keys(socialUrls).length}`);
  if (Object.keys(socialUrls).length > 0) {
    console.log(`     URLs found: ${Object.keys(socialUrls).join(', ')}`);
  }
  
  for (const [fieldName, url] of Object.entries(socialUrls)) {
    // Only update if the field is currently empty
    if (!existingFields[fieldName]) {
      updateFields[fieldName] = url;
    }
  }

  // Filter out any fields already known to be bad (from previous records in this run)
  for (const field of globalSkippedFields) {
    delete updateFields[field];
  }

  // Enrich albums (still per-artist, not batched)
  await enrichAlbums(artistName, mbData['release-groups'], existingFields['Soc Spotify Artist Id'] as string);

  // Sleep to avoid rate limits
  await sleep(500);

  return { id: recordId, fields: updateFields };
}

/**
 * Batch update artist records - retries on unknown field errors, falls back to individual on other errors
 */
async function batchUpdateArtists(batch: Array<{ id: string; fields: any }>) {
  let currentBatch = batch.map(item => ({ id: item.id, fields: { ...item.fields } }));
  let maxRetries = 10;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      await base(TABLE_ID).update(currentBatch);
      const mbCount = currentBatch[0] ? Object.keys(currentBatch[0].fields).filter(k => k.startsWith('Soc MB') || k === 'Date Formed Born' || k === 'Date Formed Born Year' || k === 'Check Musicbrainz').length : 0;
      console.log(`  ✅ Batch updated ${currentBatch.length} records (${mbCount} MB fields each)`);
      if (globalSkippedFields.size > 0) {
        console.log(`     - Globally skipped fields: ${[...globalSkippedFields].join(', ')}`);
      }
      return;
    } catch (error: any) {
      if (error.message?.includes('Unknown field name')) {
        const fieldMatch = error.message.match(/Unknown field name: "([^"]+)"/);
        if (fieldMatch) {
          const badField = fieldMatch[1];
          globalSkippedFields.add(badField);
          // Remove the bad field from every record in this batch
          currentBatch = currentBatch.map(item => {
            const fields = { ...item.fields };
            delete fields[badField];
            return { id: item.id, fields };
          });
          retryCount++;
        } else {
          console.error(`  ❌ Batch update failed (unknown field, can't parse):`, error.message);
          break;
        }
      } else {
        // Not an unknown field error - fall back to individual updates
        console.log(`  ⚠️  Batch failed, falling back to individual updates...`);
        for (const item of currentBatch) {
          try {
            await base(TABLE_ID).update(item.id, item.fields);
          } catch (individualError: any) {
            console.error(`  ❌ Failed individual update:`, individualError.message);
          }
        }
        return;
      }
    }
  }

  console.error(`  ❌ Batch max retries exceeded - too many unknown fields`);
}

/**
 * Fetch full release details from MusicBrainz
 */
async function fetchReleaseDetails(releaseId: string): Promise<any | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=labels+recordings+artist-credits+genres+tags+url-rels+artist-rels+work-rels+recording-level-rels+work-level-rels&fmt=json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    // Rate limiting: MusicBrainz allows 1 request per second
    await sleep(1000);
    
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch release group details to get releases
 */
async function fetchReleaseGroupDetails(releaseGroupId: string): Promise<any | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?inc=releases+genres+tags&fmt=json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    // Rate limiting: MusicBrainz allows 1 request per second
    await sleep(1000);
    
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch albums from Albums table for a specific artist
 */
async function fetchArtistAlbums(artistName: string, spotifyArtistId?: string) {
  try {
    let filterFormula = `{Artist Name} = "${artistName.replace(/"/g, '\\"')}"`;
    
    if (spotifyArtistId) {
      filterFormula = `OR({Artist Name} = "${artistName.replace(/"/g, '\\"')}", {Spotify Artist Id} = "${spotifyArtistId}")`;
    }
    
    const records = await albumsBase(ALBUMS_TABLE_ID)
      .select({
        filterByFormula: filterFormula
      })
      .all();
    
    return records;
  } catch (error) {
    console.error(`  ❌ Error fetching albums:`, error);
    return [];
  }
}

/**
 * Extract social URLs from release relations
 */
function extractReleaseSocialUrls(relations?: Array<{ type: string; url?: { resource: string } }>): Record<string, string> {
  const urls: Record<string, string> = {};
  
  if (!relations) return urls;
  
  for (const rel of relations) {
    const url = rel.url?.resource;
    if (!url) continue;
    
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('allmusic.com')) {
      urls['Soc AllMusic'] = url;
    } else if (urlLower.includes('discogs.com')) {
      urls['Soc Discogs'] = url;
    } else if (urlLower.includes('wikidata.org')) {
      urls['Soc Wikidata'] = url;
    }
  }
  
  return urls;
}

/**
 * Match MusicBrainz release to Airtable album
 */
function matchAlbum(mbRelease: any, airtableAlbums: readonly any[]): any | null {
  const mbTitle = mbRelease.title?.toLowerCase().trim();
  // Support both release and release-group date formats
  const mbDate = mbRelease.date || mbRelease['first-release-date'];
  const mbYear = mbDate?.substring(0, 4);
  
  if (!mbTitle) return null;
  
  // Try exact title match first
  for (const album of airtableAlbums) {
    const albumName = (album.get('Album Name') as string)?.toLowerCase().trim();
    if (!albumName) continue;
    
    // Exact match
    if (albumName === mbTitle) {
      // Check if release year matches if available
      const releaseYear = album.get('Release Year') as string;
      if (releaseYear && mbYear && releaseYear !== mbYear) {
        continue; // Skip if years don't match
      }
      return album;
    }
  }
  
  // Try fuzzy match (removing special characters, articles)
  const normalizeName = (name: string) => {
    return name
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/[^a-z0-9]/g, '')
      .toLowerCase();
  };
  
  const normalizedMbTitle = normalizeName(mbTitle);
  
  for (const album of airtableAlbums) {
    const albumName = (album.get('Album Name') as string);
    if (!albumName) continue;
    
    const normalizedAlbumName = normalizeName(albumName);
    
    if (normalizedAlbumName === normalizedMbTitle) {
      // Check release year
      const releaseYear = album.get('Release Year') as string;
      if (releaseYear && mbYear && releaseYear !== mbYear) {
        continue;
      }
      return album;
    }
  }
  
  return null;
}

/**
 * Enrich albums with MusicBrainz data
 */
async function enrichAlbums(artistName: string, releaseGroups?: any[], spotifyArtistId?: string) {
  if (!releaseGroups || releaseGroups.length === 0) {
    return;
  }
  
  // Filter for Album release groups only (not Singles, EPs, etc.)
  const albums = releaseGroups.filter((rg: any) => rg['primary-type'] === 'Album');
  
  if (albums.length === 0) {
    console.log(`  ℹ️  No albums found in MusicBrainz for ${artistName}`);
    return;
  }
  
  // Fetch artist's albums from Albums table
  const airtableAlbums = await fetchArtistAlbums(artistName, spotifyArtistId);
  
  if (airtableAlbums.length === 0) {
    console.log(`  ℹ️  No albums found in Albums table for ${artistName}`);
    return;
  }
  
  console.log(`  💿 Found ${airtableAlbums.length} albums in Airtable, ${albums.length} release groups in MusicBrainz`);
  console.log(`  📋 Airtable albums:`, airtableAlbums.map(a => `"${a.get('Album Name')}" (${a.get('Release Year')})`).join(', '));
  
  let albumsEnriched = 0;
  let albumsMatched = 0;
  
  for (const mbReleaseGroup of albums) {
    const matchedAlbum = matchAlbum(mbReleaseGroup, airtableAlbums);
    
    if (!matchedAlbum) {
      console.log(`    ℹ️  No match for: "${mbReleaseGroup.title}" (${mbReleaseGroup['first-release-date']?.substring(0, 4) || 'N/A'})`);
      continue;
    }
    
    albumsMatched++;
    
    // Get the first release from the release group (typically the "official" one)
    // We need to fetch the release-group details to get the actual release ID
    console.log(`    ✅ Matched: ${matchedAlbum.get('Album Name')} -> ${mbReleaseGroup.title}`);
    
    // For now, we'll fetch the release group to get its releases
    // Then pick the first "Official" release
    const releaseGroupDetails = await fetchReleaseGroupDetails(mbReleaseGroup.id);
    if (!releaseGroupDetails || !releaseGroupDetails.releases || releaseGroupDetails.releases.length === 0) {
      console.log(`    ⚠️  No releases found for release group`);
      continue;
    }
    
    // Find the first "Official" release, or just the first release
    const officialRelease = releaseGroupDetails.releases.find((r: any) => r.status === 'Official') || releaseGroupDetails.releases[0];
    
    // Fetch full release details
    console.log(`    🔍 Fetching details for: ${mbReleaseGroup.title}...`);
    const fullRelease = await fetchReleaseDetails(officialRelease.id);
    
    if (!fullRelease) {
      console.log(`    ⚠️  Could not fetch release details`);
      continue;
    }
    
    // Build update fields
    const updateFields: Record<string, any> = {};
    
    // MusicBrainz ID
    if (fullRelease.id) {
      updateFields['MusicBrainz ID'] = fullRelease.id;
    }
    
    // Release Country - collect all unique countries from release-events
    // Note: For individual releases, we only have the release.country field
    // For multiple countries, we'd need to look at the release-group level
    if (fullRelease.country) {
      updateFields['MB Release Country'] = fullRelease.country;
    }
    
    // Barcode
    if (fullRelease.barcode) {
      updateFields['MB Barcode'] = fullRelease.barcode;
    }
    
    // Status
    if (fullRelease.status) {
      updateFields['MB Status'] = fullRelease.status;
    }
    
    // Label Info
    if (fullRelease['label-info'] && fullRelease['label-info'].length > 0) {
      const labels = fullRelease['label-info']
        .map((li: any) => li.label?.name)
        .filter((name: string) => name)
        .join(', ');
      if (labels) {
        updateFields['MB Label Info'] = labels;
      }
    }
    
    // Track Count and Media Format
    if (fullRelease.media && fullRelease.media.length > 0) {
      const totalTracks = fullRelease.media.reduce((sum: number, m: any) => sum + (m['track-count'] || 0), 0);
      if (totalTracks > 0) {
        updateFields['MB Track Count'] = totalTracks.toString();
      }
      
      const formats = fullRelease.media
        .map((m: any) => m.format)
        .filter((f: string) => f)
        .join(', ');
      if (formats) {
        updateFields['MB Media'] = formats;
      }
    }
    
    // Genres (top 10, title cased) - from release-group
    if (releaseGroupDetails.genres && releaseGroupDetails.genres.length > 0) {
      const genres = releaseGroupDetails.genres
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 10)
        .map((g: any) => {
          return g.name.split(' ').map((word: string) => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        })
        .join(', ');
      if (genres) {
        updateFields['MB Genres'] = genres;
      }
    }
    
    // Tags (top 15, title cased, excluding genres) - from release-group
    if (releaseGroupDetails.tags && releaseGroupDetails.tags.length > 0) {
      const genreNames = releaseGroupDetails.genres?.map((g: any) => g.name.toLowerCase()) || [];
      const tags = releaseGroupDetails.tags
        .filter((t: any) => !genreNames.includes(t.name.toLowerCase()))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 15)
        .map((t: any) => {
          return t.name.split(' ').map((word: string) => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        })
        .join(', ');
      if (tags) {
        updateFields['MB Tags'] = tags;
      }
    }
    
    // Artist Credits (for compilations/various artists) - from release
    if (fullRelease['artist-credit'] && fullRelease['artist-credit'].length > 0) {
      const artistCredit = fullRelease['artist-credit']
        .map((ac: any) => ac.name || ac.artist?.name)
        .filter((name: string) => name)
        .join(', ');
      if (artistCredit) {
        updateFields['MB Artist Credit'] = artistCredit;
      }
    }
    
    // Social URLs from release relations
    const socialUrls = extractReleaseSocialUrls(fullRelease.relations);
    for (const [fieldName, url] of Object.entries(socialUrls)) {
      // Only update if field is empty
      if (!matchedAlbum.get(fieldName)) {
        updateFields[fieldName] = url;
      }
    }
    
    // Update the album if we have fields to update
    if (Object.keys(updateFields).length > 0) {
      try {
        await albumsBase(ALBUMS_TABLE_ID).update(matchedAlbum.id, updateFields);
        albumsEnriched++;
        console.log(`    ✅ Enriched: ${matchedAlbum.get('Album Name')} (${Object.keys(updateFields).length} fields)`);
      } catch (error: any) {
        console.error(`    ❌ Error updating ${matchedAlbum.get('Album Name')}:`, error.message);
      }
    }
  }
  
  if (albumsEnriched > 0) {
    console.log(`  💿 Enriched ${albumsEnriched} album(s)`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎵 MusicBrainz & TheAudioDB Enrichment');
  console.log('=====================================\n');
  console.log(`📊 Base ID: ${BASE_ID}`);
  console.log(`📋 Table: ${TABLE_ID}`);
  console.log(`👁️  View: ${VIEW_NAME}`);
  if (LIMIT) {
    console.log(`⚠️  LIMIT: ${LIMIT} records (testing mode)`);
  }
  console.log('');

  let processed = 0;
  let skipped = 0;

  try {
    console.log(`📥 Fetching records from view "${VIEW_NAME}" (paginated)...`);

    const selectOptions: any = {
      view: VIEW_NAME,
      pageSize: 100,
    };

    if (LIMIT) {
      selectOptions.maxRecords = LIMIT;
    }

    await base(TABLE_ID)
      .select(selectOptions)
      .eachPage(async (records, fetchNextPage) => {
        console.log(`📄 Processing page of ${records.length} records (total so far: ${processed + skipped})...`);

        const pageUpdates: Array<{ id: string; fields: any }> = [];

        for (const record of records) {
          const mbid = record.get('Soc Musicbrainz Id') as string;
          const artistName = record.get('Full Name') as string || record.get('Name') as string || 'Unknown Artist';

          if (!mbid) {
            console.log(`⏭️  Skipping ${artistName} - no MusicBrainz ID`);
            skipped++;
            continue;
          }

          const updateData = await enrichArtist(record.id, mbid, artistName, record.fields);
          if (updateData) {
            pageUpdates.push(updateData);
          }
          processed++;
        }

        // Batch update artist records in groups of BATCH_SIZE
        if (pageUpdates.length > 0) {
          console.log(`\n💾 Batching ${pageUpdates.length} artist updates (${BATCH_SIZE} per call)...`);
          for (let i = 0; i < pageUpdates.length; i += BATCH_SIZE) {
            const batch = pageUpdates.slice(i, i + BATCH_SIZE);
            await batchUpdateArtists(batch);
          }
        }

        fetchNextPage();
      });

    console.log('\n=====================================');
    console.log('✨ Enrichment Complete!');
    console.log(`✅ Processed: ${processed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log('=====================================\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
