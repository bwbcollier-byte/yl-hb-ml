import fs from 'fs';
import csv from 'csv-parser';
import { supabase } from './supabase';
import readline from 'readline';

// Script to upload Talent-Get Sort CSV to talent_profiles table in Supabase
// Uses airtable_id (Xatid) for smart upserting

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
      // Find the name key even if it has a Byte Order Mark (BOM) or is capitalized
      const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('name')) || 'name';
      const atidKey = Object.keys(row).find(k => k.toLowerCase().includes('xatid')) || 'Xatid';
      
      const atid = row[atidKey] || row['airtable_id'];
      
      return {
        airtable_id: atid,
        name: row[nameKey],
        imdb_id: row['imdb_id'],
        id_imdb: row['imdb_id'], // Compatibility column if needed
        tmdb_id: row['tmdb_id'],
        tmdb_about: row['tmdb_about'],
        tmdb_image: row['tmdb_image'],
        imdbpro_url: row['imdbpro.url'],
        act_type: row['act_type'],
        professions: row['professions'],
        imdb_known_for_titles: row['imdb_known_for_titles'],
        tmdb_known_for_titles: row['tmdb_known_for_titles'],
        imdb_about: row['imdb_about'],
        imdb_image: row['imdb_image'],
        imdb_trivia: row['imdb_trivia'],
        height: row['height'],
        birthyear: row['birthyear'],
        companies_all: row['companies_all'],
        
        // Socials Mapping
        social_tiktok: row['soc.tiktok'],
        social_instagram: row['soc.instagram'],
        social_twitter: row['soc.twitter'],
        social_facebook: row['soc.facebook'],
        social_youtube: row['soc.youtube'],
        social_website: row['soc.website'],
        social_imdb: row['soc.imdb'],
        social_tmdb: row['soc.tmdb'],
        
        // Profiles/Bio
        description: row['about'],
        profile_image: row['image_url'],
        gender: row['gender'],
        
        // Agency/Management Mapping
        com_talent_agent: row['com_talent_agent'],
        com_management: row['com_management'],
        com_publicist: row['com_publicist'],
        com_legal_representative: row['com_legal_representative'],
        
        updated_at: new Date().toISOString()
      };
    }).filter(record => record.airtable_id);

    if (mappedBatch.length === 0) continue;

    // Use airtable_id as conflict key.
    const { error } = await supabase
      .from('talent_profiles')
      .upsert(mappedBatch, {
         onConflict: 'airtable_id' // This ensures we update existing Film/TV profiles correctly
      });

    if (error) {
      console.error(`❌ Batch error:`, error.message);
      
      console.log('Falling back to individual updates for this batch...');
      for (const item of mappedBatch) {
          const { error: singleError } = await supabase
          .from('talent_profiles')
          .upsert(item, { onConflict: 'airtable_id' });
          if (singleError) totalErrors++;
          else totalUpserted++;
      }
    } else {
      console.log(`   ✅ Successful Upsert`);
      totalUpserted += mappedBatch.length;
    }
  }

  console.log(`\n==========================================`);
  console.log(`✨ Talent Upload Complete!`);
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
    rl.question('\n📂 Drag your Talent-Get Sort CSV here: ', (answer) => {
        rl.close();
        const cleanPath = answer.trim().replace(/^['"]|['"]$/g, '');
        if (cleanPath) processCSV(cleanPath);
        else process.exit(1);
    });
}
