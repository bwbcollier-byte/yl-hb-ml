import { supabase } from './src/supabase';

async function checkCols() {
    const { data } = await supabase.from('talent_profiles').select('*').limit(1);
    console.log(Object.keys(data![0]));
}
checkCols();
