import { supabase } from './supabase';

/**
 * MASTER SOCIAL HEALER (Row-by-Row Iterator)
 * 
 * Iterates through talent_profiles using 'linked_records_check'.
 * Checks all 23 legacy fields.
 * Creates any missing social_profiles and links them back via soc_ UUID columns.
 */

const BATCH_SIZE = 250; // Optimal batch size for processing 23 dynamic columns on 1.4M rows

const PLATFORMS = [
    { type: 'Spotify', legacyField: 'spotify_id', linkField: 'soc_spotify', kind: 'id' },
    { type: 'Instagram', legacyField: 'ig_username', linkField: 'soc_instagram', kind: 'username' },
    { type: 'TikTok', legacyField: 'tt_username', linkField: 'soc_tiktok', kind: 'username' },
    { type: 'IMDb', legacyField: 'imdb_id', linkField: 'soc_imdb', kind: 'id' },
    { type: 'Facebook', legacyField: 'social_facebook', linkField: 'soc_facebook', kind: 'url' },
    { type: 'Twitter', legacyField: 'social_twitter', linkField: 'soc_twitter', kind: 'url' },
    { type: 'YouTube', legacyField: 'social_youtube', linkField: 'soc_youtube', kind: 'url' },
    { type: 'TMDB', legacyField: 'social_tmdb', linkField: 'soc_tmdb', kind: 'url' }, // Usually URLs mapped to this old column
    { type: 'Soundcloud', legacyField: 'social_soundcloud', linkField: 'soc_soundcloud', kind: 'url' },
    { type: 'Apple Music', legacyField: 'social_apple_music', linkField: 'soc_apple_music', kind: 'url' },
    { type: 'Website', legacyField: 'social_website', linkField: 'soc_website', kind: 'url' },
    { type: 'Deezer', legacyField: 'social_deezer', linkField: 'soc_deezer', kind: 'url' },
    { type: 'Tidal', legacyField: 'social_tidal', linkField: 'soc_tidal', kind: 'url' },
    { type: 'Pandora', legacyField: 'social_pandora', linkField: 'soc_pandora', kind: 'url' },
    { type: 'Discogs', legacyField: 'social_discogs', linkField: 'soc_discogs', kind: 'url' },
    { type: 'AllMusic', legacyField: 'social_allmusic', linkField: 'soc_allmusic', kind: 'url' },
    { type: 'Bandsintown', legacyField: 'social_bandsintown', linkField: 'soc_bandsintown', kind: 'url' },
    { type: 'Songkick', legacyField: 'social_songkick', linkField: 'soc_songkick', kind: 'url' },
    { type: 'MusicBrainz', legacyField: 'social_musicbrainz', linkField: 'soc_musicbrainz', kind: 'url' },
    { type: 'Chartmetric', legacyField: 'social_chartmetric', linkField: 'soc_chartmetric', kind: 'url' },
    { type: 'Rostr', legacyField: 'social_rostr', linkField: 'soc_rostr', kind: 'url' }
];

async function processBatch() {
    // Select all the legacy fields and link fields for verification
    const selectFields = [
        'id', 'name', 
        ...PLATFORMS.map(p => p.legacyField), 
        ...PLATFORMS.map(p => p.linkField)
    ].join(', ');

    // 1. Fetch the next batch of unchecked talent profiles
    const { data: talents, error } = await supabase
        .from('talent_profiles')
        .select(selectFields)
        .is('linked_records_check', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('\n❌ Error fetching talent_profiles:', error.message);
        return 0; // Trigger retry
    }

    if (!talents || talents.length === 0) return 0; // Done!

    const newSocialsToInsert: any[] = [];
    const internalProfileLinks: Record<string, any> = {};

    // 2. Discover missing links in memory
    for (const t of (talents as any[])) {
        // Initialize the tracking object for this talent so it gets marked 'done' even if 0 missing were found
        internalProfileLinks[t.id] = {
            id: t.id,
            linked_records_check: 'done'
        };

        for (const p of PLATFORMS) {
            const legacyVal = t[p.legacyField];
            const linkedVal = t[p.linkField];

            // If it HAS a legacy string but does NOT have a valid uuid link, it's missing!
            if (legacyVal && legacyVal !== '' && !linkedVal) {
                const newRow: any = {
                    talent_id: t.id,
                    social_type: p.type,
                    name: t.name || '',
                    status: 'pending',
                    linking_status: 'done' // Already linking it right now, so mark done
                };

                if (p.kind === 'id') newRow.social_id = legacyVal;
                else if (p.kind === 'username') newRow.username = legacyVal;
                else newRow.social_url = legacyVal;

                newSocialsToInsert.push(newRow);
            }
        }
    }

    // 3. Create social profile records in bulk (if any were missing)
    if (newSocialsToInsert.length > 0) {
        const INSERT_CHUNK = 100;
        let allInserted: any[] = [];
        
        for (let i = 0; i < newSocialsToInsert.length; i += INSERT_CHUNK) {
            const chunkToInsert = newSocialsToInsert.slice(i, i + INSERT_CHUNK);
            const { data: inserted, error: insertError } = await supabase
                .from('social_profiles')
                .insert(chunkToInsert)
                .select('id, talent_id, social_type');

            if (insertError) {
                console.error('\n❌ Error inserting missing social profiles:', insertError.message);
                return 0;
            }
            if (inserted) {
                allInserted = allInserted.concat(inserted);
            }
        }

        if (allInserted.length > 0) {
            // Map the newly generated UUIDs back to the corresponding talent profile object
            for (const row of allInserted) {
                const platform = PLATFORMS.find(pl => pl.type === row.social_type);
                if (platform) {
                    internalProfileLinks[row.talent_id][platform.linkField] = row.id;
                }
            }
        }
    }

    // 4. Update the talent_profiles table (saving new soc_ UUIDs AND 'done' status)
    const talentUpdateArray = Object.values(internalProfileLinks);

    // To prevent "URI Too long" or timeout from upserting large payloads, chunk it
    const CHUNK = 200;
    for (let i = 0; i < talentUpdateArray.length; i += CHUNK) {
        const chunk = talentUpdateArray.slice(i, i + CHUNK);
        const { error: updateError } = await supabase.from('talent_profiles').upsert(chunk);
        
        if (updateError) {
            console.error('\n❌ Error updating talent_profiles:', updateError.message);
        }
    }

    return talents.length;
}

async function startHealer() {
    console.log('🚀 Starting Master Social Healer (Talent Profile Audit)...');
    
    // Get total remaining un-checked out of the 1,429,010 total records
    const { count: initialRemaining } = await supabase
        .from('talent_profiles')
        .select('id', { count: 'exact', head: true })
        .is('linked_records_check', null);

    const originalTotal = 1429010; 
    let totalProcessedThisSession = 0;
    let consecutiveErrors = 0;

    console.log(`📊 Initial State: ${initialRemaining || 0} talent records left to audit out of ${originalTotal}.`);

    while (true) {
        const count = await processBatch();

        if (count > 0) {
            totalProcessedThisSession += count;
            const currentRemaining = Math.max(0, (initialRemaining || 0) - totalProcessedThisSession);
            const totalDone = originalTotal - currentRemaining;
            const percentComplete = ((totalDone / originalTotal) * 100).toFixed(2);
            
            process.stdout.write(`\r   🔍 Audited: Current Batch: ${totalProcessedThisSession} | DB Progress: ${percentComplete}% (${totalDone}/${originalTotal} Done)`);
            consecutiveErrors = 0;
        } else if (count === 0) {
            const { count: remaining } = await supabase
                .from('talent_profiles')
                .select('id', { count: 'exact', head: true })
                .is('linked_records_check', null);
            
            if (remaining === 0) {
                console.log('\n✅ All Talent Profiles have been completely audited and healed!');
                break;
            } else {
                console.log(`\n⚠️ No progress made this round. ${remaining} records remaining. Retrying in 5s...`);
                consecutiveErrors++;
                if (consecutiveErrors > 10) {
                    console.error('❌ Too many consecutive errors. Stopping.');
                    break;
                }
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        
        // Let the DB breathe
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n✨ Social Healing & Audit Complete!');
}

startHealer();
