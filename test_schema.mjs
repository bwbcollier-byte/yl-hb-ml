import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('--- Supabase Schema Test ---');
  const { data, error } = await supabase.from('crm_companies').select('*').limit(1);
  if (error) {
    console.error('❌ Error selecting crm_companies:', error.message);
    if (error.message.includes('does not exist')) {
        console.log('Trying plural crm_companies didn\'t work. Listing tables if possible?');
        // Let\'s try talent_profiles which we know exists
        const { data: talent, error: talentError } = await supabase.from('talent_profiles').select('*').limit(1);
        if (talent) console.log('✅ Found talent_profiles! Columns:', Object.keys(talent[0]));
    }
  } else if (data && data.length > 0) {
    console.log('✅ Found crm_companies! Columns:', Object.keys(data[0]));
  } else {
    console.log('⚠️ Found crm_companies, but it is empty.');
    // Let's try to infer if we can't get column data
  }
}
run();
