import fs from 'fs';
import csv from 'csv-parser';
import { supabase } from './supabase';
import readline from 'readline';

// Script to upload IMDb Companies Grid view CSV to crm_companies table in Supabase

async function processCSV(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📄 Parsing CSV file: ${filePath}`);
  
  const results: any[] = [];
  
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });

  console.log(`✅ Loaded ${results.length} rows from CSV`);

  let totalUpserted = 0;
  let totalErrors = 0;
  
  const batchSize = 100; // Smaller batches for safety
  
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    console.log(`\n💾 Batch uploading records ${i + 1} to ${Math.min(i + batchSize, results.length)}...`);
    
    const mappedBatch = batch.map((row) => {
      // Map CSV keys (which might contain dots) to database keys
      return {
        name: row['Name'] || row['name'],
        identifier: row['id.roster'] || row['Identifier'] || row['identifier'],
        id_imdb: row['id.imdb'],
        id_roster: row['id.roster'],
        url_rostr: row['url.rostr'],
        soc_twitter: row['web.twitter'],
        city: row['location.city'],
        country_code: row['fmt.cc'],
        soc_website: row['url_website'],
        soc_instagram: row['url.instagram'],
        genres: row['genres'],
        li_logo_url: row['li.logo'],
        other_offices: row['other.offices'],
        type: row['type'],
        web_tiktok: row['web.tiktok'],
        soc_emails: row['web.emails'],
        web_linkedin_id: row['web.linkedin.id'],
        soc_youtube: row['web.youtube'],
        atid: row['XATID'],
        contacts_list: row['contacts'],
        address: row['location.address'],
        country: row['location.country'],
        location_cclink: row['location.cclink'],
        type_category: row['type.category'],
        url_imdbpro: row['url.imdbpro'],
        email: row['email'],
        phone: row['phone'],
        fax: row['fax'],
        domain: row['domain'],
        xcheck_web: row['xcheck_web'],
        updated_at: new Date().toISOString()
      };
    }).filter(record => record.identifier || record.atid || record.id_imdb); // Skip empty rows

    if (mappedBatch.length === 0) continue;

    // Use identifier or atid as conflict key
    let conflictKey = 'identifier';
    // If the data mostly has atid, we might want to use that.
    // For now, identifier seems the safest primary slug.
    
    const { error } = await supabase
      .from('crm_companies')
      .upsert(mappedBatch, {
         onConflict: 'atid' // This will update if Airtable ID matches
      });

    if (error) {
      console.error(`❌ Batch error:`, error.message);
      // Attempt 1-by-1 if batch fails, to identify bad rows
      console.log('Falling back to individual updates for this batch...');
      for (const item of mappedBatch) {
          if (!item.atid) continue;
          const { error: singleError } = await supabase
          .from('crm_companies')
          .upsert(item, { onConflict: 'atid' });
          if (singleError) totalErrors++;
          else totalUpserted++;
      }
    } else {
      console.log(`   ✅ Successful Upsert`);
      totalUpserted += mappedBatch.length;
    }
  }

  console.log(`\n==========================================`);
  console.log(`✨ Upload Complete!`);
  console.log(`✅ Total Upserted: ${totalUpserted}`);
  console.log(`❌ Total Errors:   ${totalErrors}`);
  console.log(`==========================================\n`);
}

// CLI Runner
const args = process.argv.slice(2);
if (args.length === 1) {
    processCSV(args[0]);
} else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n📂 Drag your IMDb Company CSV here: ', (answer) => {
        rl.close();
        const cleanPath = answer.trim().replace(/^['"]|['"]$/g, '');
        if (cleanPath) processCSV(cleanPath);
        else process.exit(1);
    });
}
