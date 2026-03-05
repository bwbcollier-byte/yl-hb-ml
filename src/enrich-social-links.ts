import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * SOCIAL LINK ENRICHMENT (MusicLinks API)
 * 
 * 1. Fetches 'Spotify' profiles from social_profiles.
 * 2. Uses MusicLinks API to find other social platforms.
 * 3. Creates/Updates missing social profiles.
 * 4. Logs the process in workflow_logs for talent and social profiles.
 */

const RAPID_API_KEY = process.env.RAPID_API_KEY || '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9';
const RAPID_API_HOST = 'musiclinkssapi.p.rapidapi.com';
const BATCH_SIZE = 10;
const SLEEP_MS = 1000;

const PLATFORM_MAP: Record<string, string> = {
    'Audius': 'Audius',
    'Bandcamp': 'Bandcamp',
    'Audiomack': 'Audiomack',
    'Tidal': 'Tidal',
    'Youtube': 'YouTube',
    'Deezer': 'Deezer',
    'Apple': 'Apple Music',
    'Napster': 'Napster',
    'Soundcloud': 'Soundcloud',
    'Spotify': 'Spotify',
    'Qobuz': 'Qobuz',
    'Amazon': 'Amazon Music'
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractIdFromUrl(url: string, type: string): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/').filter(p => p.length > 0);
        
        if (type === 'Spotify' || type === 'Apple Music' || type === 'Tidal' || type === 'Deezer' || type === 'Napster') {
            // Usually /artist/[id] or /[country]/artist/[name]/[id]
            return pathParts[pathParts.length - 1] || null;
        }
        
        if (type === 'YouTube') {
            if (['channel', 'user', 'c', 'artist'].includes(pathParts[0])) return pathParts[1] || null;
            if (pathParts[0]?.startsWith('@')) return pathParts[0];
            return pathParts[0] || null;
        }

        return pathParts[pathParts.length - 1] || null;
    } catch {
        const parts = url.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1] || null;
    }
}

async function fetchMusicLinks(spotifyUrl: string, retries = 1): Promise<any> {
    const url = `https://${RAPID_API_HOST}/search/url?spotify_url=${encodeURIComponent(spotifyUrl)}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-host': RAPID_API_HOST,
            'x-rapidapi-key': RAPID_API_KEY,
        }
    };

    try {
        const res = await fetch(url, options);
        if (res.status === 429) {
            console.log(`\n   ⏳ Rate limited. Sleeping 5s then retrying...`);
            await sleep(5000);
            return fetchMusicLinks(spotifyUrl, retries);
        }
        if (res.status === 500 && retries > 0) {
            console.log(`   ⚠️ API 500 for ${spotifyUrl}. Retrying...`);
            await sleep(2000);
            return fetchMusicLinks(spotifyUrl, retries - 1);
        }
        if (!res.ok) {
            console.error(`   ❌ API Error: ${res.status} for ${spotifyUrl}`);
            return null;
        }
        return await res.json();
    } catch (error) {
        console.error(`   ❌ Fetch Error for ${spotifyUrl}:`, (error as any).message);
        return null;
    }
}

function updateWorkflowLogs(existingLogs: any[] | null, entry: any) {
    const logs = Array.isArray(existingLogs) ? [...existingLogs] : [];
    logs.push({
        ...entry,
        timestamp: new Date().toISOString()
    });
    return logs;
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, talent_id, social_url, workflow_logs, name')
        .eq('social_type', 'Spotify')
        .in('status', [null, 'active'])
        .not('social_url', 'is', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Spotify profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of profiles) {
        console.log(`\n🔍 Processing: ${profile.name || profile.social_url}`);
        
        const data = await fetchMusicLinks(profile.social_url!);
        if (!data || !data.links) {
            await supabase.from('social_profiles').update({ status: 'Error' }).eq('id', profile.id);
            continue;
        }

        const talentId = profile.talent_id;
        const links = data.links;
        const discoveredPlatforms = Object.keys(links);
        
        // Fetch existing socials for this talent to avoid duplicates
        const { data: existingSocials } = await supabase
            .from('social_profiles')
            .select('social_type, social_url')
            .eq('talent_id', talentId);
            
        const existingMap = new Set(existingSocials?.map(s => `${s.social_type}:${s.social_url}`) || []);

        const newProfiles: any[] = [];
        for (const [apiType, url] of Object.entries(links)) {
            const dbType = PLATFORM_MAP[apiType];
            if (!dbType || dbType === 'Spotify') continue; // Skip unknown or Spotify itself
            
            if (!existingMap.has(`${dbType}:${url}`)) {
                newProfiles.push({
                    talent_id: talentId,
                    social_type: dbType,
                    social_url: url,
                    social_id: extractIdFromUrl(url as string, dbType),
                    name: profile.name,
                    linking_status: 'done',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }
        }

        // 1. Create new social profiles
        if (newProfiles.length > 0) {
            const { error: insertError } = await supabase.from('social_profiles').insert(newProfiles);
            if (insertError) console.error(`   ❌ Failed to insert new socials:`, insertError.message);
            else console.log(`   ✅ Created ${newProfiles.length} new social profiles.`);
        }

        // 2. Update Talent Profile Logs
        const { data: talent } = await supabase.from('talent_profiles').select('workflow_logs').eq('id', talentId).single();
        const updatedTalentLogs = updateWorkflowLogs(talent?.workflow_logs, {
            action: 'social_enrichment_musiclinks',
            platforms: discoveredPlatforms,
            spotify_source: profile.social_url,
            new_records: newProfiles.length
        });
        await supabase.from('talent_profiles').update({ workflow_logs: updatedTalentLogs }).eq('id', talentId);

        // 3. Update Spotify Profile Status and Logs
        const updatedSpotifyLogs = updateWorkflowLogs(profile.workflow_logs, {
            action: 'enriched_by_musiclinks',
            timestamp: new Date().toISOString(),
            status: 'completed'
        });
        await supabase.from('social_profiles').update({
            status: 'Done',
            workflow_logs: updatedSpotifyLogs,
            updated_at: new Date().toISOString()
        }).eq('id', profile.id);

        await sleep(SLEEP_MS);
    }

    return profiles.length;
}

async function main() {
    console.log('🏁 Starting MusicLinks Social Enrichment...');
    let totalProcessed = 0;
    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        console.log(`\r📊 Progress: ${totalProcessed} processed...`);
    }
    console.log('\n✨ Enrichment Finished!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
