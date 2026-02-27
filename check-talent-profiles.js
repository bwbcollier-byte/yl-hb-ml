#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ben/Documents/Scripts & Tasks/HB-Data-MusicArtists/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTalentProfiles() {
  try {
    console.log('🔍 Checking talent_profiles table...\n');

    // Get first row to see structure
    const { data, error, count } = await supabase
      .from('talent_profiles')
      .select('*', { count: 'exact' })
      .limit(1);

    if (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }

    console.log(`✅ Table exists with ${count} rows\n`);
    
    if (data && data.length > 0) {
      const firstRow = data[0];
      console.log('📋 Columns:');
      Object.keys(firstRow).forEach(key => {
        const value = firstRow[key];
        const type = value === null ? 'null' : typeof value;
        console.log(`   - ${key}: ${type}`);
      });
      
      console.log('\n📄 Sample row:');
      console.log(JSON.stringify(firstRow, null, 2));
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkTalentProfiles();
