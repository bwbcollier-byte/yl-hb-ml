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

    const { data: spotifyProfiles, error } = await supabase
        .from('social_profiles')
        .select('id, talent_id, social_url, social_id')
        .eq('social_type', 'Spotify')
        .order('ml_check', { ascending: true, nullsFirst: true })
        .order('last_processed', { ascending: true })
        .limit(LIMIT);

    if (error) { console.error('❌ Fetch error:', error.message); return; }
    if (!spotifyProfiles?.length) { console.log('✅ No records to process.'); return; }

    console.log(`   Found ${spotifyProfiles.length} Spotify profiles.\n`);

    let processedCount = 0, createdCount = 0, updatedCount = 0;

    for (const profile of spotifyProfiles) {
        processedCount++;
        console.log(`[${processedCount}/${spotifyProfiles.length}] ${profile.social_id || profile.id}`);

        if (!profile.social_url) { await supabase.from('social_profiles').update({ ml_check: 'no_url' }).eq('id', profile.id); continue; }

        const mlData = await fetchMusicLinks(profile.social_url);

        if (!mlData) {
            await supabase.from('social_profiles').update({ ml_check: 'failed', last_checked: new Date().toISOString() }).eq('id', profile.id);
            continue;
        }

        const talentId = profile.talent_id;

        // Update or create "Music Links" profile record
        const { data: existing } = await supabase.from('social_profiles').select('id').eq('talent_id', talentId).eq('social_type', 'Music Links').single();

        const mlRecord = {
            social_about: mlData.description || null,
            social_image: mlData.image || null,
            name: mlData.title || null,
            last_processed: new Date().toISOString(),
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ml_check: 'success',
            workflow_logs: { last_run: new Date().toISOString(), workflow: WORKFLOW_NAME }
        };

        if (existing) {
            await supabase.from('social_profiles').update(mlRecord).eq('id', existing.id);
            updatedCount++;
            console.log(`   ✅ Updated Music Links profile`);
        } else {
            await supabase.from('social_profiles').insert({ ...mlRecord, talent_id: talentId, social_type: 'Music Links', social_id: mlData.id, social_url: profile.social_url });
            createdCount++;
            console.log(`   ✨ Created Music Links profile`);
        }

        // Create any missing platform social profiles
        if (mlData.links) {
            for (const [platform, url] of Object.entries(mlData.links)) {
                if (!url) continue;
                const { data: platformExisting } = await supabase.from('social_profiles').select('id').eq('talent_id', talentId).eq('social_type', platform).single();
                if (!platformExisting) {
                    await supabase.from('social_profiles').insert({ talent_id: talentId, social_type: platform, social_url: url, status: 'active', workflow_logs: { created_by: WORKFLOW_NAME, timestamp: new Date().toISOString() } });
                    console.log(`   ➕ Created ${platform} profile`);
                }
            }
        }

        await supabase.from('social_profiles').update({ ml_check: 'success', last_processed: new Date().toISOString(), last_checked: new Date().toISOString() }).eq('id', profile.id);
        await sleep(200);
    }

    const stats = getApiStats();
    const { data: wf } = await supabase.from('workflows').select('id, processed').eq('workflow_number', '09').single();
    if (wf) await supabase.from('workflows').update({ status: 'active', processed: (wf.processed || 0) + processedCount, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', wf.id);

    console.log(`\n🎉 Done! Processed: ${processedCount}, Created: ${createdCount}, Updated: ${updatedCount}, API Success: ${stats.successRate}%`);
}

processProfiles().catch(console.error);
