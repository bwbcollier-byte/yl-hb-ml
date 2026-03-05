import dotenv from 'dotenv';
import Airtable from 'airtable';
import readline from 'readline';

dotenv.config();

// Airtable configuration
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'your_base_id';
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'your_table_id';
const VIEW_NAME = process.env.AIRTABLE_VIEW_NAME || 'Rovi Process';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

// Rovi API configuration (replace with your actual credentials and endpoint)
const ROVI_API_KEY = process.env.ROVI_API_KEY || 'your_rovi_api_key';
const ROVI_API_BASE = 'https://api.rovicorp.com/data/v1/music';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

Airtable.configure({ apiKey: AIRTABLE_TOKEN });
const base = Airtable.base(BASE_ID);

function promptForLimit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (LIMIT) {
      console.log(`\n🔢 Using LIMIT from environment: ${LIMIT}`);
      resolve(LIMIT);
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


// Placeholder for Rovi API call
async function fetchRoviArtist(artistName: string): Promise<any | null> {
  // TODO: Implement actual Rovi API call
  // Example: const url = `${ROVI_API_BASE}/artist/search?name=${encodeURIComponent(artistName)}&apikey=${ROVI_API_KEY}`;
  // Simulate API response
  await sleep(RATE_LIMIT_DELAY);
  return {
    name: artistName,
    rovi_id: 'simulated_rovi_id',
    genres: ['Pop', 'Rock'],
    biography: 'Simulated Rovi artist bio.',
    image_url: '',
    // ...other fields
  };
}


async function processArtist(record: any) {
  const recordId = record.id;
  const fields = record.fields;
  const artistName = fields['Name'] || fields['Artist Name'] || '';
  if (!artistName) {
    console.log(`   ⚠️  No artist name for record ${recordId}`);
    return null;
  }
  console.log(`🎤 Processing: ${artistName}`);
  const roviData = await fetchRoviArtist(artistName);
  if (!roviData) {
    console.log(`   ❌ No Rovi data found for ${artistName}`);
    return {
      id: recordId,
      fields: { 'Rovi Status': 'Not Found' }
    };
  }
  const updateFields: any = {
    'Rovi Status': 'Enriched',
    'Rovi ID': roviData.rovi_id,
    'Rovi Genres': roviData.genres?.join(', '),
    'Rovi Bio': roviData.biography,
    'Rovi Image': roviData.image_url,
    // ...add more mappings as needed
  };
  return { id: recordId, fields: updateFields };
}

async function main() {
  console.log('🎵 Rovi Artist Enrichment');
  console.log('================================\n');
  console.log(`Base ID: ${BASE_ID}`);
  console.log(`Table ID: ${TABLE_ID}`);
  console.log(`View: ${VIEW_NAME}`);
  console.log(`API Key: ${ROVI_API_KEY}`);
  const effectiveLimit = await promptForLimit();
  if (effectiveLimit) {
    console.log(`Limit: ${effectiveLimit} records\n`);
  }
  try {
    console.log('📥 Fetching records from Airtable...\n');
    const records: any[] = [];
    const selectOptions: any = { view: VIEW_NAME };
    if (effectiveLimit) selectOptions.maxRecords = effectiveLimit;
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
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const updateData = await processArtist(record);
      if (updateData) {
        updateBatch.push(updateData);
        console.log(`   📦 Added to batch (${updateBatch.length}/${BATCH_SIZE})`);
        if (updateBatch.length === BATCH_SIZE || i === records.length - 1) {
          try {
            console.log(`\n💾 Updating batch of ${updateBatch.length} records...`);
            await base(TABLE_ID).update(updateBatch);
            processed += updateBatch.length;
            console.log(`✅ Batch updated successfully\n`);
            updateBatch = [];
          } catch (error) {
            console.error(`❌ Error updating batch:`, error);
            console.log(`⚠️  Attempting individual updates...`);
            for (const singleUpdate of updateBatch) {
              try {
                await base(TABLE_ID).update(singleUpdate.id, singleUpdate.fields);
                processed++;
                console.log(`   ✅ Individual update successful`);
              } catch (individualError) {
                console.error(`   ❌ Individual update failed:`, individualError);
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

main();
