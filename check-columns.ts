import dotenv from 'dotenv';
import { supabase } from './src/supabase';

dotenv.config();

async function checkColumns() {
  const { data, error } = await supabase
    .from('talent_profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data && data[0]) {
    console.log('Columns:', Object.keys(data[0]).sort().join(', '));
  } else {
    console.log('No data found to check columns.');
  }
}

checkColumns();
