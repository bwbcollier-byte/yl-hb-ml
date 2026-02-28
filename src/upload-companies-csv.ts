import fs from 'fs';
import csv from 'csv-parser';
import { supabase } from './supabase';
import readline from 'readline';

// Script to upload IMDb Companies Grid view CSV to crm_companies table in Supabase
// Optimized to avoid Foreign Key violations by checking existence and only updating non-key fields

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
  
  const batchSize = 100;
  
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    console.log(`\n💾 Processing records ${i + 1} to ${Math.min(i + batchSize, results.length)}...`);
    
    const mappedBatch = batch.map((row) => {
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
    }).filter(record => record.atid);

    if (mappedBatch.length === 0) continue;

    // 1. Find which of these ATIDs already exist in the DB
    const atids = mappedBatch.map(r => r.atid);
    const { data: existingRecords, error: fetchError } = await supabase
      .from('crm_companies')
      .select('atid, identifier')
      .in('atid', atids);

    if (fetchError) {
      console.error(`❌ Error fetching existing records:`, fetchError.message);
      totalErrors += mappedBatch.length;
      continue;
    }

    const existingAtids = new Set(existingRecords?.map(r => r.atid) || []);
    
    // 2. Split batch into "New" and "Existing"
    const newRecords = mappedBatch.filter(r => !existingAtids.has(r.atid));
    const updateRecords = mappedBatch.filter(r => existingAtids.has(r.atid));

    // 3. Process New Records (Insert including identifier)
    if (newRecords.length > 0) {
      console.log(`   🆕 Inserting ${newRecords.length} new companies...`);
      const { error: insertError } = await supabase
        .from('crm_companies')
        .insert(newRecords);
      
      if (insertError) {
        console.error(`   ❌ Insert error:`, insertError.message);
        totalErrors += newRecords.length;
      } else {
        totalUpserted += newRecords.length;
      }
    }

    // 4. Process Existing Records (Update EXCLUDING identifier to avoid FK violation)
    if (updateRecords.length > 0) {
      console.log(`   🔄 Updating ${updateRecords.length} existing companies (protecting identifiers)...`);
      
      // We process updates concurrently in small chunks to be fast
      const updatePromises = updateRecords.map(async (record) => {
        const { identifier, atid, ...fieldsToUpdate } = record;
        const { error: updateError } = await supabase
          .from('crm_companies')
          .update(fieldsToUpdate)
          .eq('atid', atid);
        
        if (updateError) {
          console.error(`     ❌ Update error for ${record.name}:`, updateError.message);
          return false;
        }
        return true;
      });

      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r === true).length;
      const failCount = results.length - successCount;
      
      totalUpserted += successCount;
      totalErrors += failCount;
    }

    console.log(`   ✅ Current Progress: ${totalUpserted} success, ${totalErrors} errors`);
  }

  console.log(`\n==========================================`);
  console.log(`✨ Upload Complete!`);
  console.log(`✅ Total Successfully Processed: ${totalUpserted}`);
  console.log(`❌ Total Errors Encountered:      ${totalErrors}`);
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
