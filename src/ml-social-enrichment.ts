import { supabase } from './supabase';
import { fetchMusicLinks, sleep, getApiStats } from './ml-api';
import * as dotenv from 'dotenv';

dotenv.config();

const LIMIT_ENV = process.env.LIMIT;
const RUN_ALL = !LIMIT_ENV || LIMIT_ENV.trim() === '';
const LIMIT = RUN_ALL ? 999999 : parseInt(LIMIT_ENV as string);
const WORKFLOW_NAME = 'Music Links Social Enrichment';

async function processProfiles() {
    console.log(`\n🚀 Starting ${WORKFLOW_NAME}`);
    console.log(`   Limit: ${RUN_ALL ? 'All' : LIMIT} records\n`);

    // 1. Find Spotify profiles to process
    // We prioritize those never checked, then oldest checked
    const { data: spotifyProfiles, error: fetchError } = await supabase
        .from('hb_socials')
        .select('id, linked_talent, social_url, identifier')
        .eq('type', 'Spotify')
        .limit(LIMIT);

    if (fetchError) {
        console.error('❌ Error fetching Spotify profiles:', fetchError.message);
        return;
    }

    if (!spotifyProfiles || spotifyProfiles.length === 0) {
        console.log('✅ No Spotify profiles to process.');
        return;
    }

    console.log(`   Found ${spotifyProfiles.length} Spotify profiles to enrich.\n`);

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;

    for (const profile of spotifyProfiles) {
        processedCount++;
        console.log(`[${processedCount}/${spotifyProfiles.length}] Processing Spotify profile: ${profile.identifier || profile.id}`);

        if (!profile.social_url) {
            console.log(`   ⚠️ Skip: No social_url`);
            continue;
        }

        const talentId = profile.linked_talent;
        const mlData = await fetchMusicLinks(profile.social_url);

        if (!mlData) {
            console.log(`   ⚠️ API failed for ${profile.social_url}`);
            continue;
        }

        // 2. Manage "Music Links" record
        const { data: mlProfile } = await supabase
            .from('hb_socials')
            .select('id')
            .eq('linked_talent', talentId)
            .eq('type', 'Music Links')
            .single();

        const mlUpdate = {
            description: mlData.description || null,
            image: mlData.image || null,
            name: mlData.title || null,
            updated_at: new Date().toISOString()
        };

        if (mlProfile) {
            await supabase.from('hb_socials').update(mlUpdate).eq('id', mlProfile.id);
            updatedCount++;
            console.log(`   ✅ Updated "Music Links" profile: ${mlProfile.id}`);
        } else {
            await supabase.from('hb_socials').insert({
                ...mlUpdate,
                linked_talent: talentId,
                type: 'Music Links',
                identifier: mlData.id || profile.identifier,
                social_url: profile.social_url // Use Spotify URL as base link
            });
            createdCount++;
            console.log(`   ✨ Created "Music Links" profile`);
        }

        // 3. Process individual social links
        if (mlData.links) {
            for (const [platform, url] of Object.entries(mlData.links)) {
                if (!url) continue;

                // Check if this specific platform link already exists for this talent
                const { data: existing } = await supabase
                    .from('hb_socials')
                    .select('id')
                    .eq('linked_talent', talentId)
                    .eq('type', platform)
                    .single();

                if (!existing) {
                    await supabase.from('hb_socials').insert({
                        linked_talent: talentId,
                        type: platform,
                        social_url: url,
                        status: 'active'
                    });
                    console.log(`   ➕ Created ${platform} profile: ${url}`);
                }
            }
        }

        await sleep(200);
    }

    // 5. Update Workflows Record
    const stats = getApiStats();
    const { data: wf } = await supabase.from('workflows').select('id, processed').eq('workflow_number', '09').single();
    if (wf) {
        await supabase.from('workflows').update({
            status: 'active',
            processed: (wf.processed || 0) + processedCount,
            last_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', wf.id);
    }

    console.log(`\n🎉 Finished ${WORKFLOW_NAME}`);
    console.log(`   Processed: ${processedCount}`);
    console.log(`   ML Profiles Created: ${createdCount}`);
    console.log(`   ML Profiles Updated: ${updatedCount}`);
    console.log(`   API Success Rate: ${stats.successRate}%\n`);
}

processProfiles().catch(console.error);
