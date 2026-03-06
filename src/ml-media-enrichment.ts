import { supabase } from './supabase';
import { fetchMusicLinks, sleep, getApiStats } from './ml-api';
import * as dotenv from 'dotenv';

dotenv.config();

const LIMIT_ENV = process.env.LIMIT;
const RUN_ALL = !LIMIT_ENV || LIMIT_ENV.trim() === '';
const LIMIT = RUN_ALL ? 999999 : parseInt(LIMIT_ENV as string);
const WORKFLOW_NAME = 'Music Links Media Enrichment';

async function processMedia() {
    console.log(`\n🚀 Starting ${WORKFLOW_NAME}`);
    console.log(`   Limit: ${RUN_ALL ? 'All' : LIMIT} records\n`);

    // 1. Find Media Profiles with Spotify URLs to enrich
    const { data: mediaRecords, error: fetchError } = await supabase
        .from('media_profiles')
        .select('id, talent_profile_id, spotify_album_url, album_name')
        .not('spotify_album_url', 'is', null)
        .order('ml_check', { ascending: true, nullsFirst: true })
        .order('last_processed', { ascending: true })
        .limit(LIMIT);

    if (fetchError) {
        console.error('❌ Error fetching media profiles:', fetchError.message);
        return;
    }

    if (!mediaRecords || mediaRecords.length === 0) {
        console.log('✅ No media profiles to process.');
        return;
    }

    console.log(`   Found ${mediaRecords.length} media records to enrich.\n`);

    let processedCount = 0;
    let updatedCount = 0;

    for (const record of mediaRecords) {
        processedCount++;
        console.log(`[${processedCount}/${mediaRecords.length}] Processing Album: ${record.album_name || record.id}`);

        if (!record.spotify_album_url) {
            continue;
        }

        const mlData = await fetchMusicLinks(record.spotify_album_url);

        if (!mlData) {
            console.log(`   ⚠️ API failed for ${record.spotify_album_url}`);
            await supabase.from('media_profiles').update({ 
                ml_check: 'failed'
            }).eq('id', record.id);
            continue;
        }

        // Map Music Links to database columns
        const updates: any = {
            ml_check: 'success',
            last_processed: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (mlData.links) {
            if (mlData.links.Deezer) updates.deezer_url = mlData.links.Deezer;
            if (mlData.links.Apple) updates.apple_music_url = mlData.links.Apple;
            if (mlData.links.Youtube) updates.youtube_music_url = mlData.links.Youtube;
            if (mlData.links.Tidal) updates.tidal_url = mlData.links.Tidal;
            if (mlData.links.Soundcloud) updates.soundcloud_url = mlData.links.Soundcloud;
            if (mlData.links.Amazon) updates.amazon_music_url = mlData.links.Amazon;
            if (mlData.links.Bandcamp) updates.bandcamp_url = mlData.links.Bandcamp;
            // itunes_url might be different from apple_music_url in some cases but often same
            if (mlData.links.Apple) updates.itunes_url = mlData.links.Apple.replace('music.apple.com', 'itunes.apple.com');
        }

        // Add to workflow logs
        const { data: current } = await supabase.from('media_profiles').select('workflow_logs').eq('id', record.id).single();
        const logs = current?.workflow_logs || {};
        logs['MusicLinks'] = {
            last_run: new Date().toISOString(),
            status: 'success',
            links_found: Object.keys(mlData.links || {}).length
        };
        updates.workflow_logs = logs;

        const { error: updateError } = await supabase.from('media_profiles').update(updates).eq('id', record.id);

        if (updateError) {
            console.error(`   ❌ Update error:`, updateError.message);
        } else {
            updatedCount++;
            console.log(`   ✅ Enriched with ${Object.keys(mlData.links || {}).length} links`);
        }

        await sleep(200);
    }

    // 2. Update Workflows Table Record
    const stats = getApiStats();
    const { data: wf } = await supabase.from('workflows').select('id, processed').eq('workflow_number', '10').single();
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
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   API Success Rate: ${stats.successRate}%\n`);
}

processMedia().catch(console.error);
