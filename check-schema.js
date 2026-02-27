#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/ben/Documents/Scripts & Tasks/HB-Data-MusicArtists/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function introspectSchema() {
  try {
    console.log('🔍 Checking Supabase tables...\n');
    
    // Try to access expected tables
    const expectedTables = [
      'music_artist_profiles',
      'music_albums',
      'music_concerts',
      'enrichment_tracking',
      'master_albums',
      'master_artists',
      'media_profiles',
    ];

    const existingTables = [];

    for (const tableName of expectedTables) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .limit(1);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('returning 0 rows')) {
          console.log(`✅ Table exists: ${tableName} (0 rows)`);
          existingTables.push(tableName);
        } else if (error.message.includes('Relation not found') || error.code === 'PGRST100') {
          console.log(`❌ Table does not exist: ${tableName}`);
        } else {
          console.log(`⚠️  ${tableName}: ${error.message}`);
        }
      } else {
        const rowCount = data ? data.length : 0;
        console.log(`✅ Table exists: ${tableName} (${rowCount} rows)`);
        existingTables.push(tableName);
      }
    }

    if (existingTables.length > 0) {
      console.log(`\n📊 Found ${existingTables.length} tables. Getting column info...\n`);
      
      // Try to get column info using Postgres system tables
      const query = `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name IN (${existingTables.map(t => `'${t}'`).join(',')})
        ORDER BY table_name, ordinal_position
      `;

      const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', { sql: query }).catch(() => ({ data: null, error: 'RPC not available' }));

      if (columnsError || !columns) {
        console.log('⚠️ Column details not available. Tables found:');
        existingTables.forEach(t => console.log(`   - ${t}`));
      } else {
        let currentTable = '';
        columns.forEach(col => {
          if (col.table_name !== currentTable) {
            currentTable = col.table_name;
            console.log(`📋 ${currentTable}`);
          }
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
          console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}`);
        });
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

introspectSchema();
