import { supabase } from './src/supabase';

async function checkCols() {
    const { data } = await supabase.from('talent_profiles').select('mb_check').not('mb_check', 'is', null).limit(5);
    console.log(data);
}
checkCols();
