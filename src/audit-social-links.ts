import { supabase } from './supabase';

/**
 * SOCIAL LINKS AUDITOR & HEALER
 * 
 * 1. Links talent_profiles.soc_[platform] to social_profiles.id
 * 2. Identifies and fixes missing social profiles for records that have an ID in the master table.
 */

const BATCH_SIZE = 1000;
const PLATFORMS = [
    { type: 'Spotify', masterId: 'spotify_id', socField: 'soc_spotify' },
    { type: 'Instagram', masterId: 'ig_username', socField: 'soc_instagram' },
    { type: 'TikTok', masterId: 'tt_username', socField: 'soc_tiktok' },
    { type: 'IMDb', masterId: 'imdb_id', socField: 'soc_imdb' }
];

async function auditPlatform(platform: typeof PLATFORMS[0]) {
    console.log(`\n🔍 Auditing ${platform.type}...`);
    let linkedCount = 0;
    let createdCount = 0;
    let lastId = '';

    while (true) {
        // 1. Fetch social profiles of this type that haven't been linked back yet
        const { data: socials, error } = await supabase
            .from('social_profiles')
            .select('id, talent_id')
            .eq('social_type', platform.type)
            .order('id', { ascending: true })
            .gt('id', lastId)
            .limit(BATCH_SIZE);

        if (error) {
            console.error(`   ❌ Error fetching socials for ${platform.type}:`, error.message);
            break;
        }

        if (!socials || socials.length === 0) break;

        // 2. Prepare batch updates for talent_profiles
        const updates = socials.map(s => ({
            id: s.talent_id,
            [platform.socField]: s.id
        }));

        const { error: updateError } = await supabase
            .from('talent_profiles')
            .upsert(updates);

        if (updateError) {
            console.error(`   ❌ Error updating talent_profiles for ${platform.type}:`, updateError.message);
        } else {
            linkedCount += socials.length;
            process.stdout.write(`\r   📊 Linked ${linkedCount} ${platform.type} profiles...`);
        }

        lastId = socials[socials.length - 1].id;
    }

    console.log(`\n   ✅ Finished linking existing ${platform.type} profiles.`);

    // 3. Find missing ones (Has Master ID but no socField link)
    console.log(`   🛠️ Checking for missing ${platform.type} social profiles...`);
    const { data: missing, error: missingError } = await supabase
        .from('talent_profiles')
        .select(`id, name, ${platform.masterId}`)
        .not(platform.masterId, 'is', null)
        .neq(platform.masterId, '')
        .is(platform.socField, null)
        .limit(1000); // Check first 1000 missing

    if (missingError) {
        console.error(`   ❌ Error checking missing ${platform.type}:`, missingError.message);
    } else if (missing && missing.length > 0) {
        console.log(`   ⚠️ Found ${missing.length} missing ${platform.type} profiles. Healing...`);
        
        const newSocials = missing.map(m => ({
            talent_id: m.id,
            social_type: platform.type,
            social_id: platform.type === 'Spotify' || platform.type === 'IMDb' ? m[platform.masterId] : null,
            username: platform.type === 'Instagram' || platform.type === 'TikTok' ? m[platform.masterId] : null,
            name: m.name,
            status: 'pending'
        }));

        const { data: inserted, error: insertError } = await supabase
            .from('social_profiles')
            .insert(newSocials)
            .select();

        if (insertError) {
            console.error(`   ❌ Error healing ${platform.type}:`, insertError.message);
        } else if (inserted) {
            // Update the talent links with the new social IDs
            const healingLinks = inserted.map(s => ({
                id: s.talent_id,
                [platform.socField]: s.id
            }));
            await supabase.from('talent_profiles').upsert(healingLinks);
            createdCount += inserted.length;
            console.log(`   ✅ Healed ${inserted.length} ${platform.type} profiles.`);
        }
    } else {
        console.log(`   ✅ No missing ${platform.type} profiles found in this check.`);
    }
}

async function runAudit() {
    console.log('🏁 Starting Social Link Audit & Heatlh Check...');
    for (const platform of PLATFORMS) {
        await auditPlatform(platform);
    }
    console.log('\n✨ Audit Finished!');
}

runAudit();
