import { supabase } from './src/supabase';

async function checkCols() {
    const { data: sample } = await supabase
        .from('social_profiles')
        .select('linking_status')
        .eq('social_type', 'Spotify')
        .limit(100);
        
    const statuses = new Set(sample?.map(s => s.linking_status));
    console.log(`Unique linking_status:`, Array.from(statuses));
}
checkCols();
