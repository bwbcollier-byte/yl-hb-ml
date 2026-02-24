import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

// Configuration
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appiYGWjEZVB76yyl';
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblQ3DrCHekgRqj7Z';
const VIEW_NAME = process.env.AIRTABLE_VIEW_NAME || 'ADB Process';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

// TheAudioDB API Configuration
const AUDIODB_API_KEY = process.env.AUDIODB_API_KEY || '925704';
const AUDIODB_API_BASE = 'https://www.theaudiodb.com/api/v1/json';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

// Initialize Airtable
Airtable.configure({ apiKey: AIRTABLE_TOKEN });
const base = Airtable.base(BASE_ID);

// Utility: Sleep function for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch artist data from TheAudioDB using MusicBrainz ID
 */
async function fetchAudioDBArtist(musicbrainzId: string): Promise<any | null> {
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/artist-mb.php?i=${musicbrainzId}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB API error: ${response.status}`);
      return null;
    }
    
    const data: any = await response.json();
    if (data.artists && data.artists.length > 0) {
      return data.artists[0];
    }
    return null;
  } catch (error) {
    console.error(`   ❌ Error fetching AudioDB artist data:`, error);
    return null;
  }
}

/**
 * Search for artist by name when MusicBrainz ID is missing or fails
 */
async function searchAudioDBArtistByName(artistName: string): Promise<any | null> {
  const encodedName = encodeURIComponent(artistName);
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/search.php?s=${encodedName}`;
  
  try {
    console.log(`   🔍 Searching by artist name: "${artistName}"`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB Search API error: ${response.status}`);
      return null;
    }
    
    const data: any = await response.json();
    if (data.artists && data.artists.length > 0) {
      // If multiple results, try to find exact match
      const exactMatch = data.artists.find((artist: any) => 
        artist.strArtist?.toLowerCase() === artistName.toLowerCase()
      );
      
      if (exactMatch) {
        console.log(`   ✅ Found exact match: ${exactMatch.strArtist}`);
        return exactMatch;
      }
      
      // If no exact match, take first result but warn
      console.log(`   ⚠️  No exact match. Using first result: ${data.artists[0].strArtist}`);
      console.log(`   📊 Total results: ${data.artists.length}`);
      return data.artists[0];
    }
    
    console.log(`   ⚠️  No results found for artist name search`);
    return null;
  } catch (error) {
    console.error(`   ❌ Error searching AudioDB by artist name:`, error);
    return null;
  }
}

/**
 * Fetch social links from TheAudioDB
 */
async function fetchAudioDBSocial(artistId: string): Promise<any[]> {
  const url = `${AUDIODB_API_BASE}/${AUDIODB_API_KEY}/artist-social.php?i=${artistId}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`   ❌ AudioDB Social API error: ${response.status}`);
      return [];
    }
    
    const data: any = await response.json();
    if (data.artists && Array.isArray(data.artists)) {
      return data.artists;
    }
    return [];
  } catch (error) {
    console.error(`   ❌ Error fetching AudioDB social data:`, error);
    return [];
  }
}

/**
 * Extract social links from the social endpoint response
 */
function extractSocialLinks(socialData: any[]): {
  instagram?: string;
  spotify?: string;
  youtube?: string;
  soundcloud?: string;
  deezer?: string;
  itunes?: string;
  discogs?: string;
  songkick?: string;
  beatport?: string;
  tidal?: string;
  twitter?: string;
  facebook?: string;
  website?: string;
} {
  const links: any = {};
  
  for (const entry of socialData) {
    const site = entry.strSite?.toLowerCase();
    const link = entry.strLink;
    
    if (!site || !link) continue;
    
    switch (site) {
      case 'instagram':
        links.instagram = link;
        break;
      case 'spotify':
        links.spotify = link;
        break;
      case 'youtube':
        links.youtube = link;
        break;
      case 'soundcloud':
        links.soundcloud = link;
        break;
      case 'deezer':
        links.deezer = link;
        break;
      case 'itunes':
        links.itunes = link;
        break;
      case 'discogs':
        links.discogs = link;
        break;
      case 'songkick':
        links.songkick = link;
        break;
      case 'beatport':
        links.beatport = link;
        break;
      case 'tidal':
        links.tidal = link;
        break;
      case 'twitter':
        links.twitter = link;
        break;
      case 'facebook':
        links.facebook = link;
        break;
      case 'website':
        links.website = link;
        break;
    }
  }
  
  return links;
}

/**
 * Process a single artist record
 */
async function processArtist(record: any): Promise<{ id: string; fields: any } | null> {
  const recordId = record.id;
  const artistName = record.fields['Name'] || 'Unknown';
  const musicbrainzId = record.fields['Soc Musicbrainz Id'];
  
  console.log(`\n📋 Processing: ${artistName}`);
  console.log(`   MusicBrainz ID: ${musicbrainzId || 'None'}`);
  
  let artistData = null;
  
  // Try MusicBrainz ID lookup first if available
  if (musicbrainzId) {
    console.log(`   🔍 Fetching TheAudioDB artist data via MusicBrainz ID...`);
    artistData = await fetchAudioDBArtist(musicbrainzId);
    await sleep(RATE_LIMIT_DELAY);
  }
  
  // Fallback to name search if MusicBrainz lookup failed or no ID
  if (!artistData) {
    if (musicbrainzId) {
      console.log(`   ⚠️  No AudioDB data found via MusicBrainz ID`);
    }
    console.log(`   🔄 Attempting fallback search by artist name...`);
    artistData = await searchAudioDBArtistByName(artistName);
    await sleep(RATE_LIMIT_DELAY);
  }
  
  if (!artistData) {
    console.log(`   ❌ No AudioDB data found via MusicBrainz ID or name search`);
    
    // Set Not Found status
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const updateDetails = `${timestamp} - Not Found: No AudioDB data available for this artist`;
    const existingUpdates = record.fields['ADB Updates'] || '';
    
    return {
      id: recordId,
      fields: {
        'Soc ADB Status': 'Not Found',
        'ADB Updates': existingUpdates ? `${existingUpdates}\n${updateDetails}` : updateDetails,
        'Soc ADB Check': timestamp
      }
    };
  }
  
  console.log(`   ✅ Found TheAudioDB data`);
  
  // Prepare update fields
  const updateFields: any = {};
  const updatedFieldsList: string[] = [];
  
  // Prepare current date for ADB Check field (YYYY-MM-DD format)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}`;
  
  // Basic Info
  if (artistData.idArtist) { updateFields['Soc ADB Artist ID'] = artistData.idArtist; updatedFieldsList.push('Artist ID'); }
  if (artistData.strArtist) { updateFields['Soc ADB Artist'] = artistData.strArtist; updatedFieldsList.push('Artist Name'); }
  if (artistData.strArtistStripped) { updateFields['Soc ADB ArtistStripped'] = artistData.strArtistStripped; updatedFieldsList.push('Artist Stripped'); }
  if (artistData.strArtistAlternate) { updateFields['Soc ADB Artist Alternate'] = artistData.strArtistAlternate; updatedFieldsList.push('Artist Alternate'); }
  if (artistData.strLabel) { updateFields['Soc ADB Label'] = artistData.strLabel; updatedFieldsList.push('Label'); }
  if (artistData.idLabel) { updateFields['Soc ADB Label Id'] = artistData.idLabel; updatedFieldsList.push('Label ID'); }
  
  // Years
  if (artistData.intFormedYear) updateFields['Soc ADB Formed Year'] = artistData.intFormedYear;
  if (artistData.intBornYear) updateFields['Soc ADB Born Year'] = artistData.intBornYear;
  if (artistData.intDiedYear) updateFields['Soc ADB Died Year'] = artistData.intDiedYear;
  if (artistData.strDisbanded) updateFields['Soc ADB Disbanded'] = artistData.strDisbanded;
  
  // Genre/Style
  if (artistData.strStyle) updateFields['Soc ADB Style'] = artistData.strStyle;
  if (artistData.strGenre) updateFields['Soc ADB Genre'] = artistData.strGenre;
  if (artistData.strMood) updateFields['Soc ADB Mood'] = artistData.strMood;
  
  // Basic Links (from main artist endpoint)
  if (artistData.strWebsite) updateFields['Soc ADB Website'] = artistData.strWebsite;
  if (artistData.strFacebook) updateFields['Soc ADB Facebook'] = artistData.strFacebook;
  // Note: Twitter field from main endpoint often returns a number (1), so we only use the social endpoint for Twitter
  
  // Biographies (all languages)
  if (artistData.strBiographyEN) updateFields['Soc ADB BiographyEN'] = artistData.strBiographyEN;
  // Biography language fields - only include if they exist in your Airtable
  // Uncomment these if you've added the biography language fields to Airtable:
  // if (artistData.strBiographyDE) updateFields['Soc ADB Biography DE'] = artistData.strBiographyDE;
  // if (artistData.strBiographyFR) updateFields['Soc ADB Biography FR'] = artistData.strBiographyFR;
  // if (artistData.strBiographyCN) updateFields['Soc ADB Biography CN'] = artistData.strBiographyCN;
  // if (artistData.strBiographyIT) updateFields['Soc ADB Biography IT'] = artistData.strBiographyIT;
  // if (artistData.strBiographyJP) updateFields['Soc ADB Biography JP'] = artistData.strBiographyJP;
  // if (artistData.strBiographyRU) updateFields['Soc ADB Biography RU'] = artistData.strBiographyRU;
  // if (artistData.strBiographyES) updateFields['Soc ADB Biography ES'] = artistData.strBiographyES;
  // if (artistData.strBiographyPT) updateFields['Soc ADB Biography PT'] = artistData.strBiographyPT;
  // if (artistData.strBiographySE) updateFields['Soc ADB Biography SE'] = artistData.strBiographySE;
  // if (artistData.strBiographyNL) updateFields['Soc ADB Biography NL'] = artistData.strBiographyNL;
  // if (artistData.strBiographyHU) updateFields['Soc ADB Biography HU'] = artistData.strBiographyHU;
  // if (artistData.strBiographyNO) updateFields['Soc ADB Biography NO'] = artistData.strBiographyNO;
  // if (artistData.strBiographyIL) updateFields['Soc ADB Biography IL'] = artistData.strBiographyIL;
  // if (artistData.strBiographyPL) updateFields['Soc ADB Biography PL'] = artistData.strBiographyPL;
  
  // Artist Info
  if (artistData.strGender) updateFields['Soc ADB Gender'] = artistData.strGender;
  if (artistData.intMembers) updateFields['Soc ADB Members'] = artistData.intMembers;
  if (artistData.strCountry) updateFields['Soc ADB Country'] = artistData.strCountry;
  if (artistData.strCountryCode) updateFields['Soc ADB CountryCode'] = artistData.strCountryCode;
  
  // Images
  if (artistData.strArtistThumb) updateFields['Soc ADB Artist Thumb'] = artistData.strArtistThumb;
  if (artistData.strArtistLogo) updateFields['Soc ADB Artist Logo'] = artistData.strArtistLogo;
  if (artistData.strArtistCutout) updateFields['Soc ADB Artist Cutout'] = artistData.strArtistCutout;
  if (artistData.strArtistClearart) updateFields['Soc ADB Artist Clearart'] = artistData.strArtistClearart;
  if (artistData.strArtistWideThumb) updateFields['Soc ADB Artist Wide Thumb'] = artistData.strArtistWideThumb;
  if (artistData.strArtistFanart) updateFields['Soc ADB Artist Fanart'] = artistData.strArtistFanart;
  if (artistData.strArtistFanart2) updateFields['Soc ADB Artist Fanart2'] = artistData.strArtistFanart2;
  if (artistData.strArtistFanart3) updateFields['Soc ADB Artist Fanart3'] = artistData.strArtistFanart3;
  if (artistData.strArtistFanart4) updateFields['Soc ADB Artist Fanart4'] = artistData.strArtistFanart4;
  if (artistData.strArtistBanner) updateFields['Soc ADB ArtistBanner'] = artistData.strArtistBanner;
  
  // Metadata
  if (artistData.strMusicBrainzID) updateFields['Soc ADB Musicbrainz Id'] = artistData.strMusicBrainzID;
  if (artistData.strISNIcode) updateFields['Soc ADB ISNI code'] = artistData.strISNIcode;
  if (artistData.strLastFMChart) updateFields['Soc ADB LastFMChart'] = artistData.strLastFMChart;
  if (artistData.intCharted) updateFields['Soc ADB Charted'] = artistData.intCharted;
  if (artistData.strLocked) updateFields['Soc ADB Locked'] = artistData.strLocked;
  
  // Fetch social links if we have an artist ID
  if (artistData.idArtist) {
    console.log(`   🔍 Fetching social links...`);
    const socialData = await fetchAudioDBSocial(artistData.idArtist);
    await sleep(RATE_LIMIT_DELAY);
    
    if (socialData.length > 0) {
      console.log(`   ✅ Found ${socialData.length} social links`);
      const socialLinks = extractSocialLinks(socialData);
      
      // Update social fields
      if (socialLinks.instagram) updateFields['Soc ADB Instagram'] = socialLinks.instagram;
      if (socialLinks.spotify) updateFields['Soc ADB Spotify'] = socialLinks.spotify;
      if (socialLinks.youtube) updateFields['Soc ADB YouTube'] = socialLinks.youtube;
      if (socialLinks.soundcloud) updateFields['Soc ADB SoundCloud'] = socialLinks.soundcloud;
      if (socialLinks.deezer) updateFields['Soc ADB Deezer'] = socialLinks.deezer;
      if (socialLinks.itunes) updateFields['Soc ADB iTunes'] = socialLinks.itunes;
      if (socialLinks.discogs) updateFields['Soc ADB Discogs'] = socialLinks.discogs;
      if (socialLinks.songkick) updateFields['Soc ADB Songkick'] = socialLinks.songkick;
      if (socialLinks.beatport) updateFields['Soc ADB Beatport'] = socialLinks.beatport;
      if (socialLinks.tidal) updateFields['Soc ADB Tidal'] = socialLinks.tidal;
      if (socialLinks.twitter) updateFields['Soc ADB Twitter'] = socialLinks.twitter;
    }
  }
  
  // Set ADB Check date
  updateFields['Soc ADB Check'] = timestamp;
  
  // Check if this is a new record or update
  const isNewRecord = !record.fields['Soc ADB Artist ID'];
  const status = isNewRecord ? 'Complete' : 'Updated';
  
  // Set status
  updateFields['Soc ADB Status'] = status;
  
  // Build update details message
  const updateDetails = `${timestamp} - ${status}: ${updatedFieldsList.length} fields updated (${updatedFieldsList.join(', ')})`;
  
  // Append to existing updates or create new
  const existingUpdates = record.fields['ADB Updates'] || '';
  updateFields['ADB Updates'] = existingUpdates ? `${existingUpdates}\n${updateDetails}` : updateDetails;
  
  console.log(`   ✅ Prepared update with ${Object.keys(updateFields).length} fields (${status})`);
  
  return {
    id: recordId,
    fields: updateFields
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🎵 TheAudioDB Artist Enrichment');
  console.log('================================\n');
  console.log(`Base ID: ${BASE_ID}`);
  console.log(`Table ID: ${TABLE_ID}`);
  console.log(`View: ${VIEW_NAME}`);
  console.log(`API Key: ${AUDIODB_API_KEY}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} records\n`);
  
  try {
    // Fetch records from view
    console.log('📥 Fetching records from Airtable...\n');
    
    const records: any[] = [];
    const selectOptions: any = { view: VIEW_NAME };
    if (LIMIT) selectOptions.maxRecords = LIMIT;
    
    await base(TABLE_ID)
      .select(selectOptions)
      .eachPage((pageRecords, fetchNextPage) => {
        records.push(...pageRecords);
        fetchNextPage();
      });
    
    console.log(`✅ Found ${records.length} records to process\n`);
    
    if (records.length === 0) {
      console.log('No records to process. Exiting.');
      return;
    }
    
    let processed = 0;
    let skipped = 0;
    let updateBatch: any[] = [];
    const BATCH_SIZE = 10;
    
    // Process records sequentially (with rate limiting)
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const updateData = await processArtist(record);
      
      if (updateData) {
        updateBatch.push(updateData);
        console.log(`   📦 Added to batch (${updateBatch.length}/${BATCH_SIZE})`);
        
        // Update when batch is full or it's the last record
        if (updateBatch.length === BATCH_SIZE || i === records.length - 1) {
          try {
            console.log(`\n💾 Updating batch of ${updateBatch.length} records...`);
            await base(TABLE_ID).update(updateBatch);
            processed += updateBatch.length;
            console.log(`✅ Batch updated successfully\n`);
            updateBatch = [];
          } catch (error) {
            console.error(`❌ Error updating batch:`, error);
            
            // Fallback: try updating records individually
            console.log(`⚠️  Attempting individual updates...`);
            for (const singleUpdate of updateBatch) {
              try {
                await base(TABLE_ID).update(singleUpdate.id, singleUpdate.fields);
                processed++;
                console.log(`   ✅ Individual update successful`);
              } catch (individualError) {
                console.error(`   ❌ Individual update failed:`, individualError);
                
                // Try to set Error status
                try {
                  const now = new Date();
                  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  const errorMsg = individualError instanceof Error ? individualError.message : String(individualError);
                  const updateDetails = `${timestamp} - Error: ${errorMsg}`;
                  
                  await base(TABLE_ID).update(singleUpdate.id, {
                    'Soc ADB Status': 'Error',
                    'ADB Updates': updateDetails
                  });
                } catch (statusError) {
                  console.error(`   ⚠️  Could not set error status:`, statusError);
                }
                
                skipped++;
              }
            }
            updateBatch = [];
          }
        }
      } else {
        skipped++;
      }
    }
    
    console.log(`\n✅ Enrichment complete!`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped: ${skipped}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run main function
main();
