import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('--- Checking crm_contacts Table ---');
  const { data, error } = await supabase.from('crm_contacts').select('*').limit(1);
  if (error) {
    console.error('❌ Error selecting crm_contacts:', error.message);
  } else if (data && data.length > 0) {
    console.log('✅ Found crm_contacts! Columns:', Object.keys(data[0]));
  } else {
    console.log('⚠️ Found crm_contacts, but it is empty.');
  }
}
run();
