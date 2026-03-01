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
    'IMDb': 'soc_imdb',
    'Facebook': 'soc_facebook',
    'Twitter': 'soc_twitter',
    'YouTube': 'soc_youtube',
    'TMDB': 'soc_tmdb',
    'Soundcloud': 'soc_soundcloud',
    'Apple Music': 'soc_apple_music',
    'Website': 'soc_website',
    'Deezer': 'soc_deezer',
    'Tidal': 'soc_tidal',
    'Pandora': 'soc_pandora',
    'Discogs': 'soc_discogs',
    'AllMusic': 'soc_allmusic',
    'Bandsintown': 'soc_bandsintown',
    'Songkick': 'soc_songkick',
    'MusicBrainz': 'soc_musicbrainz',
    'AudioDB': 'soc_audiodb',
    'Chartmetric': 'soc_chartmetric',
    'Rostr': 'soc_rostr',
    'IMDbPro': 'soc_imdbpro'
};

const SLEEP_MS = 100;

async function processBatch() {
    // 1. Fetch unlinked social profiles
    // Instead of filtering by IN platform_map which can be slow on 2M records, just get ANY null status that matches
    const { data: socials, error } = await supabase
        .from('social_profiles')
        .select('id, talent_id, social_type')
        .is('linking_status', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching socials:', error.message);
        return 0;
    }

    if (!socials || socials.length === 0) {
        return 0;
    }

    // 2. Prepare updates for talent_profiles
    const talentUpdates: Record<string, any> = {};
    const validSocialIds: string[] = []; // Only track ones we actually process
    
    for (const s of socials) {
        const field = PLATFORM_MAP[s.social_type];
        
        validSocialIds.push(s.id); // Even if it's an unrecognized platform, we mark it done

        if (!field) continue;
        
        if (!talentUpdates[s.talent_id]) {
            talentUpdates[s.talent_id] = { id: s.talent_id };
        }
        talentUpdates[s.talent_id][field] = s.id;
    }

    const talentUpdateArray = Object.values(talentUpdates);

    // 3. Update Talent Profiles in chunks if necessary, but 1000 isn't too many
    if (talentUpdateArray.length > 0) {
        const { error: talentError } = await supabase
            .from('talent_profiles')
            .upsert(talentUpdateArray);

        if (talentError) {
            console.error('❌ Error updating talent records:', talentError.message);
            return 0;
        }
    }

    // 4. Mark Socials as linked using small batches to avoid "Bad Request" (URI Too Long / Payload Too Large)
    const CHUNK_SIZE = 250; 
    let updatedCount = 0;

    for (let i = 0; i < validSocialIds.length; i += CHUNK_SIZE) {
        const chunk = validSocialIds.slice(i, i + CHUNK_SIZE);
        const { error: socialError } = await supabase
            .from('social_profiles')
            .update({ linking_status: 'done' })
            .in('id', chunk);

        if (socialError) {
            console.error('❌ Error updating social status chunk:', socialError.message);
        } else {
            updatedCount += chunk.length;
        }
    }

    return updatedCount;
}

async function startLinking() {
    console.log('🚀 Starting Comprehensive Social Linking...');
    let totalProcessed = 0;
    let consecutiveErrors = 0;

    while (true) {
        const count = await processBatch();
        
        if (count > 0) {
            totalProcessed += count;
            process.stdout.write(`\r   📊 LinkedIn ${totalProcessed} social profiles out of 2.1M...`);
            consecutiveErrors = 0;
        } else if (count === 0) {
            const { count: remaining } = await supabase
                .from('social_profiles')
                .select('id', { count: 'exact', head: true })
                .is('linking_status', null);
            
            if (remaining === 0) {
                console.log('\n✅ All targeted social profiles have been linked!');
                break;
            } else {
                console.log(`\n⚠️ No progress made this round. ${remaining} records remaining. Retrying in 5s...`);
                consecutiveErrors++;
                if (consecutiveErrors > 10) {
                    console.error('❌ Too many consecutive errors. Stopping.');
                    break;
                }
                // Sleep using promise
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // Small delay to prevent network overwhelm
        await new Promise(resolve => setTimeout(resolve, SLEEP_MS));
    }

    console.log('\n✨ Social Linking Complete!');
}

startLinking();
