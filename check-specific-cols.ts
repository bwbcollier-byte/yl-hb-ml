import { supabase } from './src/supabase';
async function check() {
  const { data } = await supabase.from('talent_profiles').select('*').limit(1);
  if (!data || data.length === 0) {
      console.log('No data found in talent_profiles');
      return;
  }
  const keys = Object.keys(data[0]);
  const search = ['sp_followers', 'sp_monthly_listeners', 'sp_popularity', 'sp_genres', 'sp_image'];
  search.forEach(k => {
      console.log(`Column ${k}: ${keys.includes(k) ? 'EXISTS' : 'MISSING'}`);
  });
}
check();
