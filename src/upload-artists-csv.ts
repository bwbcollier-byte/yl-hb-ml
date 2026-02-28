import fs from 'fs';
import csv from 'csv-parser';
import { supabase } from './supabase';
import readline from 'readline';

// Example: ts-node src/upload-artists-csv.ts /path/to/file.csv

async function processCSV(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📄 Parsing CSV file: ${filePath}`);
  
  const results: any[] = [];
  
  // Create a Promise to comfortably wait for streams to finish reading
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
  
  // We'll process them in batches of 500 for maximum Supabase performance
  const batchSize = 500;
  
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    console.log(`\n💾 Batch uploading records ${i + 1} to ${Math.min(i + batchSize, results.length)}...`);
    
    // Remap CSV headers into the Supabase database expected format
    const mappedBatch = batch.map((row) => {
      // Create flexible mapping so if a column doesn't exist it just maps null/undefined
      const spotify_id = row['artist_id'] || row['id'] || row['spotify_id']; // Handle 'artist_id' mapping
      
      // Clean up brackets from genres: "['Pop', 'Rock']" -> "Pop, Rock"
      let cleanGenres = null;
      if (row['genres']) {
          cleanGenres = row['genres'].replace(/\['/g, '').replace(/'\]/g, '').replace(/'/g, '');
      }

      return {
        spotify_id: spotify_id, // THIS is the primary conflict key
        name: row['name'],
        sp_followers: row['followers'] ? parseInt(row['followers']) : null,
        sp_popularity: row['popularity'] ? parseInt(row['popularity']) : null,
        sp_genres: cleanGenres,
        // Optional: Force a sp_data_status to 'Updated' so we know we got it
        sp_data_status: 'Pre-Loaded from CSV',
        updated_at: new Date().toISOString()
      };
    }).filter(record => record.spotify_id); // Drop any rows that are completely empty / missing an ID

    if (mappedBatch.length === 0) continue;

    // Use pure upsert: This means "Insert if it doesn't exist, UPDATE if it does"!
    const { error } = await supabase
      .from('talent_profiles')
      .upsert(mappedBatch, {
         onConflict: 'spotify_id' // Exactly what you asked for!
      });

    if (error) {
      console.error(`❌ Batch error:`, error.message);
      totalErrors += mappedBatch.length;
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

// Simple CLI Runner:
const args = process.argv.slice(2);

if (args.length === 1) {
    processCSV(args[0]);
} else {
    // If they didn't pass a command line arg, prompt them visually:
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n📂 Drag and drop your CSV file here (or paste the file path): ', (answer) => {
        rl.close();
        const cleanPath = answer.trim().replace(/^['"]|['"]$/g, ''); // Remove quotes if dragged in
        if (!cleanPath) {
           console.log("No path provided. Exiting.");
           process.exit(1);
        }
        processCSV(cleanPath);
    });
}
