import { supabase } from './supabase';

/**
 * SOCIAL HEALER (Missing Link Creator)
 * 
 * If talent_profiles has a legacy field populated (like 'social_deezer') 
 * BUT the direct link ('soc_deezer') is empty, this script creates the 
 * missing social_profile and links it back.
 */

const BATCH_SIZE = 1000;

const PLATFORMS = [
    { type: 'Spotify', legacyField: 'spotify_id', linkField: 'soc_spotify', kind: 'id' },
    { type: 'Instagram', legacyField: 'ig_username', linkField: 'soc_instagram', kind: 'username' },
    { type: 'TikTok', legacyField: 'tt_username', linkField: 'soc_tiktok', kind: 'username' },
    { type: 'IMDb', legacyField: 'imdb_id', linkField: 'soc_imdb', kind: 'id' },
    { type: 'Facebook', legacyField: 'social_facebook', linkField: 'soc_facebook', kind: 'url' },
    { type: 'Twitter', legacyField: 'social_twitter', linkField: 'soc_twitter', kind: 'url' },
    { type: 'YouTube', legacyField: 'social_youtube', linkField: 'soc_youtube', kind: 'url' },
    { type: 'TMDB', legacyField: 'social_tmdb', linkField: 'soc_tmdb', kind: 'id' }, // TMDB is usually stored as an ID in the legacy column if it's from enrichment, but check if it's URL. We'll default to url since old columns were 'social_tmdb'.
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
    { type: 'AudioDB', legacyField: 'social_audiodb', linkField: 'soc_audiodb', kind: 'url' },
    { type: 'Chartmetric', legacyField: 'social_chartmetric', linkField: 'soc_chartmetric', kind: 'url' },
    { type: 'Rostr', legacyField: 'social_rostr', linkField: 'soc_rostr', kind: 'url' },
    { type: 'IMDbPro', legacyField: 'social_imdbpro', linkField: 'soc_imdbpro', kind: 'url' }
];

async function healPlatform(platform: typeof PLATFORMS[0]) {
    console.log(`\n🔍 Checking ${platform.type} for missing links...`);
    let healedCount = 0;

    let consecutiveErrors = 0;
    while (true) {
        // Find records with legacy data but NO linked profile. 
        // We drop 'order' and 'gt' to avoid massive sorting overhead (which causes Statement Timeouts on 1.4M rows).
        // Since we link them inside the loop, they naturally fall out of this filter on the next pass!
        const { data: missing, error } = await supabase
            .from('talent_profiles')
            .select(`id, name, ${platform.legacyField}`)
            .not(platform.legacyField, 'is', null)
            .neq(platform.legacyField, '')
            .is(platform.linkField, null)
            .limit(BATCH_SIZE);

        if (error) {
            console.error(`   ❌ Error fetching missing for ${platform.type}:`, error.message);
            consecutiveErrors++;
            if (consecutiveErrors > 3) break;
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }
        
        consecutiveErrors = 0;

        if (!missing || missing.length === 0) break;

        // Create the new social records
        const newSocials = missing.map((m: any) => {
            const row: any = {
                talent_id: m.id,
                social_type: platform.type,
                name: m.name || '',
                status: 'pending',
                linking_status: 'done' // Pre-mark it so the background linker ignores it later
            };

            const rawVal = m[platform.legacyField];
            
            if (platform.kind === 'id') {
                row.social_id = rawVal;
            } else if (platform.kind === 'username') {
                row.username = rawVal;
            } else {
                row.social_url = rawVal;
            }

            return row;
        });

        const { data: inserted, error: insertError } = await supabase
            .from('social_profiles')
            .insert(newSocials)
            .select('id, talent_id');

        if (insertError) {
            console.error(`   ❌ Error creating social profiles for ${platform.type}:`, insertError.message);
            break;
        }

        if (inserted && inserted.length > 0) {
            // Bulk update talent_profiles with the new IDs to close the loop
            const updates = inserted.map((s: any) => ({
                id: s.talent_id,
                [platform.linkField]: s.id
            }));

            const { error: updateError } = await supabase
                .from('talent_profiles')
                .upsert(updates);

            if (updateError) {
                console.error(`   ❌ Error saving link back to talent_profiles for ${platform.type}:`, updateError.message);
            } else {
                healedCount += inserted.length;
                process.stdout.write(`\r   ✅ Successfully created & linked ${healedCount} missing ${platform.type} profiles.`);
            }
        }
    }

    if (healedCount > 0) {
        console.log(`\n   ✨ ${platform.type} Healing Complete! Total Fixed: ${healedCount}`);
    } else {
        console.log(`   ✅ ${platform.type} is 100% healthy. No missing links found.`);
    }
}

async function runHealer() {
    console.log('🏁 Starting Social Link Healer...');
    
    for (const platform of PLATFORMS) {
        await healPlatform(platform);
    }
    
    console.log('\n==========================================');
    console.log('🏁 ALL PLATFORMS AUDITED & HEALED! 🏁');
    console.log('==========================================\n');
}

runHealer();
