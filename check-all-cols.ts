import { supabase } from './src/supabase';
async function check() {
  console.log('--- Checking talent_profiles ---');
  const { data: tData } = await supabase.from('talent_profiles').select('*').limit(1);
  const tKeys = tData && tData.length > 0 ? Object.keys(tData[0]) : [];
  console.log('talent_profiles sample keys:', tKeys.slice(0, 10), '...');
  
  console.log('\n--- Checking social_profiles ---');
  const { data: sData } = await supabase.from('social_profiles').select('*').limit(1);
  const sKeys = sData && sData.length > 0 ? Object.keys(sData[0]) : [];
  console.log('social_profiles sample keys:', sKeys);
  
  const searchS = ['followers_count', 'following', 'social_rank', 'images', 'top_cities'];
  searchS.forEach(k => {
      console.log(`Column social_profiles.${k}: ${sKeys.includes(k) ? 'EXISTS' : 'MISSING'}`);
  });
}
check();
