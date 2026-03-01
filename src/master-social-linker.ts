import { supabase } from './supabase';

/**
 * MASTER SOCIAL LINKER (High Performance)
 * 
 * This script links social_profiles IDs back to the talent_profiles.soc_[platform] columns.
 * It uses the 'linking_status' column in social_profiles to track progress across 2.1M records.
 */

const BATCH_SIZE = 1000;
const PLATFORM_MAP: Record<string, string> = {
    'Spotify': 'soc_spotify',
    'Instagram': 'soc_instagram',
    'TikTok': 'soc_tiktok',
    'IMDb': 'soc_imdb'
};

async function processBatch() {
    // 1. Fetch unlinked social profiles
    const { data: socials, error } = await supabase
        .from('social_profiles')
        .select('id, talent_id, social_type')
        .is('linking_status', null)
        .in('social_type', Object.keys(PLATFORM_MAP))
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching socials:', error.message);
        return 0;
    }

    if (!socials || socials.length === 0) {
        return 0;
    }

    // 2. Prepare updates for talent_profiles
    // We group by talent_id to handle a talent having multiple socials in the same batch
    const talentUpdates: Record<string, any> = {};
    
    for (const s of socials) {
        const field = PLATFORM_MAP[s.social_type];
        if (!field) continue;
        
        if (!talentUpdates[s.talent_id]) {
            talentUpdates[s.talent_id] = { id: s.talent_id };
        }
        talentUpdates[s.talent_id][field] = s.id;
    }

    const talentUpdateArray = Object.values(talentUpdates);

    // 3. Update Talent Profiles (Upsert is the best way to batch update by ID)
    const { error: talentError } = await supabase
        .from('talent_profiles')
        .upsert(talentUpdateArray);

    if (talentError) {
        console.error('❌ Error updating talent records:', talentError.message);
        // If one fails, we don't mark socials as done
        return 0;
    }

    // 4. Mark Socials as linked
    const socialIds = socials.map(s => s.id);
    const { error: socialError } = await supabase
        .from('social_profiles')
        .update({ linking_status: 'done' })
        .in('id', socialIds);

    if (socialError) {
        console.error('❌ Error updating social status:', socialError.message);
        return 0;
    }

    return socials.length;
}

async function startLinking() {
    console.log('🚀 Starting High-Performance Social Linking...');
    let totalProcessed = 0;
    let consecutiveErrors = 0;

    while (true) {
        const count = await processBatch();
        
        if (count > 0) {
            totalProcessed += count;
            process.stdout.write(`\r   📊 Linked ${totalProcessed} social profiles...`);
            consecutiveErrors = 0;
        } else if (count === 0) {
            // Check if we're actually done or if there's an error
            const { count: remaining } = await supabase
                .from('social_profiles')
                .select('id', { count: 'exact', head: true })
                .is('linking_status', null)
                .in('social_type', Object.keys(PLATFORM_MAP));
            
            if (remaining === 0) {
                console.log('\n✅ All social profiles have been linked!');
                break;
            } else {
                console.log(`\n⚠️ No progress made this round. ${remaining} records remaining. Retrying in 5s...`);
                consecutiveErrors++;
                if (consecutiveErrors > 5) {
                    console.error('❌ Too many consecutive errors. Stopping.');
                    break;
                }
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    console.log('\n✨ Social Linking Complete!');
}

startLinking();
