import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * MUSICFETCH MASTER ENRICHER
 * 
 * 1. Finds Spotify profiles where mf_check is NULL
 * 2. Hits MusicFetch API with deep-field parameters
 * 3. Enriches:
 *    - talent_profiles (dob, hometown, aliases)
 *    - social_profiles (social_about, + discovery of other platforms)
 * 4. Marks mf_check = NOW()
 */

const BATCH_SIZE = 20;
const SLEEP_MS = 2100; // ~28 req/min for MusicFetch
const MF_TOKEN = process.env.MUSICFETCH_TOKEN || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhY2NvdW50SWQiOiJhY2NvdW50XzJZZ0FveTdZY2dza1dVYUcwUzQwNG8iLCJpYXQiOjE3NzIyMTc5OTMuNDgxfQ.jZoVWVWDM2bcIc0Oq6V_t2fy2Q3XPp61Bc-9VQp7pq0';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchMusicFetch(spotifyUrl: string) {
    const encodedUrl = encodeURIComponent(spotifyUrl);
    // Added all parameters from your curl request
    const services = 'spotify,appleMusic,amazon,amazonMusic,audiomack,bandcamp,beatport,boomplay,deezer,discogs,genius,iHeartRadio,instagram,youtubeMusic,youtube,tiktok,tidal,soundcloud,shazam,pandora,musicBrainz';
    const fields = 'name,country,images,dateOfBirth,links,dateOfDeath,hometown,description,genres,shows,aliases';
    
    const url = `https://api.musicfetch.io/url?url=${encodedUrl}&services=${encodeURIComponent(services)}&country=US&withTracks=true&withDistributor=true&withPerformance=true&withCredits=true&withServiceLevel=${encodeURIComponent(fields)}`;

    try {
        const res = await fetch(url, {
            headers: { 'x-token': MF_TOKEN }
        });
        if (res.status === 429) {
            console.log('\n   ⏳ MusicFetch Rate limited. Sleeping 10s...');
            await sleep(10000);
            return fetchMusicFetch(spotifyUrl);
        }
        if (!res.ok) return null;
        return await res.json();
    } catch (error) {
        console.error('❌ MusicFetch Network Error:', error);
        return null;
    }
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_url, talent_id, name')
        .eq('social_type', 'Spotify')
        .is('mf_check', null)
        .not('social_url', 'is', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of profiles) {
        process.stdout.write(`\r   🔍 MusicFetch: ${profile.name || profile.id}...`);
        
        const data = await fetchMusicFetch(profile.social_url!);
        const result = data?.result;

        if (result) {
            // 1. Update Talent Metadata
            const talentUpdate: any = {};
            if (result.dateOfBirth) talentUpdate.dob = result.dateOfBirth;
            if (result.hometown) talentUpdate.hometown = result.hometown;
            if (result.aliases && Array.isArray(result.aliases)) talentUpdate.aliases = result.aliases;
            
            if (Object.keys(talentUpdate).length > 0) {
                await supabase.from('talent_profiles').update(talentUpdate).eq('id', profile.talent_id);
            }

            // 2. Update current Social Profile (Bio)
            if (result.description) {
                await supabase.from('social_profiles').update({
                    social_about: result.description,
                    updated_at: new Date().toISOString()
                }).eq('id', profile.id);
            }

            // 3. Discovery/Linking (All other platforms)
            const services = result.services || {};
            for (const [sKey, sData] of Object.entries(services) as [string, any][]) {
                const sType = mapServiceToType(sKey);
                if (!sType || sType === 'Spotify') continue;

                const url = sData.link || (sData.links && sData.links[0]?.url);
                const sId = sData.id ? String(sData.id) : null;

                if (url || sId) {
                    const { data: existing } = await supabase
                        .from('social_profiles')
                        .select('id, social_id, social_url')
                        .eq('talent_id', profile.talent_id)
                        .eq('social_type', sType)
                        .maybeSingle();

                    if (!existing) {
                        await supabase.from('social_profiles').insert({
                            talent_id: profile.talent_id,
                            social_type: sType,
                            social_id: sId,
                            social_url: url,
                            name: profile.name,
                            linking_status: 'done',
                            created_at: new Date().toISOString()
                        });
                    } else {
                        // Update missing ID or URL if discovered
                        const updateObj: any = {};
                        if (!existing.social_id && sId) updateObj.social_id = sId;
                        if (!existing.social_url && url) updateObj.social_url = url;
                        
                        if (Object.keys(updateObj).length > 0) {
                            await supabase.from('social_profiles').update({
                                ...updateObj,
                                updated_at: new Date().toISOString()
                            }).eq('id', existing.id);
                        }
                    }
                }
            }

            // 4. Mark checked
            await supabase.from('social_profiles').update({
                mf_check: new Date().toISOString()
            }).eq('id', profile.id);

        } else {
            // Mark as checked to avoid re-retrying failures
            await supabase.from('social_profiles').update({
                mf_check: new Date().toISOString()
            }).eq('id', profile.id);
        }

        await sleep(SLEEP_MS);
    }

    return profiles.length;
}

function mapServiceToType(key: string): string | null {
    const map: Record<string, string> = {
        appleMusic: 'Apple Music',
        instagram: 'Instagram',
        facebook: 'Facebook',
        twitter: 'Twitter',
        x: 'Twitter',
        youtube: 'YouTube',
        youtubeMusic: 'YouTube Music',
        tiktok: 'TikTok',
        soundcloud: 'Soundcloud',
        deezer: 'Deezer',
        tidal: 'Tidal',
        pandora: 'Pandora',
        audiomack: 'Audiomack',
        beatport: 'Beatport',
        bandcamp: 'Bandcamp',
        discogs: 'Discogs',
        genius: 'Genius',
        iHeartRadio: 'iHeartRadio',
        amazonMusic: 'Amazon Music',
        amazon: 'Amazon',
        wikipedia: 'Wikipedia',
        musicBrainz: 'MusicBrainz',
        shazam: 'Shazam'
    };
    return map[key] || null;
}

async function main() {
    console.log('\n🎧 MusicFetch Master Linker & Talent Enricher');
    console.log('============================================');

    let totalProcessed = 0;
    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   ✅ Total Spotify profiles checked: ${totalProcessed}`);
    }
    console.log(`\n\n✨ Done! Enriched ${totalProcessed} artists.`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
