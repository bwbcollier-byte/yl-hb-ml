import { supabase } from './src/supabase';

async function checkCols() {
    const { data } = await supabase.from('social_profiles').select('*').limit(1);
    console.log(Object.keys(data![0]));
}
checkCols();
