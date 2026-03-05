import { supabase } from './src/supabase';

async function check() {
    console.log("Checking social_profiles for Spotify...");
    
    // Count total Spotify
    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('social_type', 'Spotify');
        
    console.log(`Total Spotify profiles: ${total}`);

    // Get a sample to see status values
    const { data: sample } = await supabase
        .from('social_profiles')
        .select('status, linking_status')
        .eq('social_type', 'Spotify')
        .limit(100);
        
    const statuses = new Set(sample?.map(s => s.status));
    console.log(`Unique statuses in sample:`, Array.from(statuses));
}
check();
