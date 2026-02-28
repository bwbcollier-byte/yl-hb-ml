import fs from 'fs';
import csv from 'csv-parser';
import { supabase } from './supabase';
import readline from 'readline';

// Script to upload IMDb Contacts Grid view CSV to crm_contacts table in Supabase
// Uses atid (XATID) for smart upserting

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
    
    // Map CSV keys to database keys
    const mappedBatch = batch.map((row) => {
      return {
        atid: row['XATID'],
        id_imdb: row['id.imdb'],
        url_roster: row['url_roster'],
        first_name: row['name_first'],
        last_name: row['name_last'],
        name_full: row['name'],
        url_imdb: row['url.imdb'],
        role: row['role'],
        position: row['position'],
        phone: row['office_phone'],
        fax: row['fax'],
        email: row['email'],
        email_gen: row['email.gen'],
        image_url: row['image'],
        url_linkedin: row['url_linkedin'],
        url_instagram: row['url_instagram'],
        url_twitter: row['url_twitter'],
        website: row['url_website'],
        location: row['location'],
        company_name: row['company_name'],
        co_id_imdb: row['co.id.imdb'],
        status_update: row['status_update'],
        updated_at: new Date().toISOString()
      };
    }).filter(record => record.atid);

    if (mappedBatch.length === 0) continue;

    // Use atid as conflict key. Ensure you have the unique constraint in Supabase:
    // ALTER TABLE crm_contacts ADD CONSTRAINT unique_contact_atid UNIQUE (atid);
    
    const { error } = await supabase
      .from('crm_contacts')
      .upsert(mappedBatch, {
         onConflict: 'atid'
      });

    if (error) {
      console.error(`❌ Batch error:`, error.message);
      if (error.message.includes('unique or exclusion constraint')) {
          console.log('⚠️  Tip: Run "ALTER TABLE crm_contacts ADD CONSTRAINT unique_contact_atid UNIQUE (atid);" in Supabase SQL Editor');
      }
      
      console.log('Falling back to individual updates for this batch...');
      for (const item of mappedBatch) {
          const { error: singleError } = await supabase
          .from('crm_contacts')
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
    rl.question('\n📂 Drag your IMDb Contacts CSV here: ', (answer) => {
        rl.close();
        const cleanPath = answer.trim().replace(/^['"]|['"]$/g, '');
        if (cleanPath) processCSV(cleanPath);
        else process.exit(1);
    });
}
