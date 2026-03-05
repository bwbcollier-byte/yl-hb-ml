import { supabase } from './src/supabase';

async function checkCols() {
    const { data: sample } = await supabase
        .from('social_profiles')
        .select('last_processed, mf_check')
        .eq('social_type', 'Spotify')
        .not('last_processed', 'is', null)
        .limit(10);
        
    console.log(`Profiles with last_processed NOT NULL:`, sample?.length);
    console.log(sample);
}
checkCols();
