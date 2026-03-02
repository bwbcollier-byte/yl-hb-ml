import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';
import readline from 'readline';

dotenv.config();

/**
 * MUSICFETCH MASTER ENRICHER (V2.1 - SUPER BATCHED)
 * 
 * 1. Finds Spotify profiles where mf_check is NULL
 * 2. Hits MusicFetch API with deep-field parameters
 * 3. BATCHES all database operations to minimize round-trips:
 *    - All existing social profiles are pre-fetched in 1 call per batch.
 *    - All talent updates are executed in 1 bulk call.
 *    - All new social profiles are inserted in 1 bulk call.
 *    - All existing social profile updates are executed in 1 bulk call.
 */

const BATCH_SIZE = 20;
const SLEEP_MS = 1600; // ~37.5 requests per minute

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchMusicFetch(spotifyUrl: string, token: string) {
    const encodedUrl = encodeURIComponent(spotifyUrl);
    const services = 'spotify,appleMusic,amazon,amazonMusic,audiomack,bandcamp,beatport,boomplay,deezer,discogs,genius,iHeartRadio,instagram,youtubeMusic,youtube,tiktok,tidal,soundcloud,shazam,pandora,musicBrainz';
    const fields = 'name,country,images,dateOfBirth,links,dateOfDeath,hometown,description,genres,shows,aliases';
    
    const url = `https://api.musicfetch.io/url?url=${encodedUrl}&services=${encodeURIComponent(services)}&country=US&withTracks=true&withDistributor=true&withPerformance=true&withCredits=true&withServiceLevel=${encodeURIComponent(fields)}`;

    try {
        const res = await fetch(url, {
            headers: { 'x-token': token }
        });
        if (res.status === 429) {
            console.log('\n   ⏳ MusicFetch Rate limited. Sleeping 15s...');
            await sleep(15000);
            return fetchMusicFetch(spotifyUrl, token);
        }
        if (!res.ok) return null;
        return await res.json();
    } catch (error) {
        console.error('❌ MusicFetch Network Error:', error);
        return null;
    }
}

async function processBatch(token: string): Promise<number> {
    const { data: spotifyProfiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_url, social_id, talent_id, name')
        .eq('social_type', 'Spotify')
        .is('mf_check', null)
        .not('social_url', 'is', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching profiles:', error.message);
        return 0;
    }

    if (!spotifyProfiles || spotifyProfiles.length === 0) return 0;

    // PRE-FETCH all existing social profiles for this batch of talents
    const talentIds = spotifyProfiles.map(p => p.talent_id);
    const { data: existingSocials } = await supabase
        .from('social_profiles')
        .select('id, talent_id, social_type, social_id, social_url, social_image, social_about')
        .in('talent_id', talentIds);

    // Organize existing socials by talent_id + social_type for O(1) lookup
    const socialMap = new Map<string, any>();
    existingSocials?.forEach(s => {
        socialMap.set(`${s.talent_id}_${s.social_type}`, s);
    });

    const talentUpdates: any[] = [];
    const socialInserts: any[] = [];
    const socialUpdates: any[] = [];
    const spotifyRowUpdates: any[] = [];

    for (const profile of spotifyProfiles) {
        process.stdout.write(`\r   🔍 MusicFetch: ${profile.name || profile.id}...`);
        
        const data = await fetchMusicFetch(profile.social_url!, token);
        const result = data?.result;

        if (result) {
            // 1. Prepare MusicFetch social_profile
            const existingMF = socialMap.get(`${profile.talent_id}_MusicFetch`);
            if (!existingMF) {
                socialInserts.push({
                    talent_id: profile.talent_id,
                    social_type: 'MusicFetch',
                    social_id: profile.social_id,
                    social_url: profile.social_url,
                    name: profile.name,
                    social_about: result.description,
                    social_image: result.image?.url,
                    linking_status: 'done',
                    created_at: new Date().toISOString()
                });
            } else {
                socialUpdates.push({
                    id: existingMF.id,
                    social_about: result.description,
                    social_image: result.image?.url,
                    updated_at: new Date().toISOString()
                });
            }

            // 2. Prepare Talent Metadata
            const tUpdate: any = { id: profile.talent_id };
            let hasTChange = false;
            if (result.dateOfBirth) { tUpdate.dob = result.dateOfBirth; hasTChange = true; }
            if (result.hometown) { tUpdate.hometown = result.hometown; hasTChange = true; }
            if (result.aliases && Array.isArray(result.aliases)) { tUpdate.aliases = result.aliases; hasTChange = true; }
            if (hasTChange) talentUpdates.push(tUpdate);

            // 3. Prepare Discovery/Linking
            const services = result.services || {};
            for (const [sKey, sData] of Object.entries(services) as [string, any][]) {
                const sType = mapServiceToType(sKey);
                if (!sType || sType === 'Spotify' || sType === 'MusicFetch') continue;

                const url = sData.link || (sData.links && sData.links[0]?.url);
                const sId = sData.id ? String(sData.id) : null;
                const sImg = sData.images?.[0]?.url || sData.image?.url;
                const sAbout = sData.description;

                if (url || sId) {
                    const existing = socialMap.get(`${profile.talent_id}_${sType}`);
                    if (!existing) {
                        socialInserts.push({
                            talent_id: profile.talent_id,
                            social_type: sType,
                            social_id: sId,
                            social_url: url,
                            social_image: sImg,
                            social_about: sAbout,
                            name: profile.name,
                            linking_status: 'done',
                            created_at: new Date().toISOString()
                        });
                    } else {
                        const sUpdate: any = { id: existing.id };
                        let hasSChange = false;
                        if (!existing.social_id && sId) { sUpdate.social_id = sId; hasSChange = true; }
                        if (!existing.social_url && url) { sUpdate.social_url = url; hasSChange = true; }
                        if (!existing.social_image && sImg) { sUpdate.social_image = sImg; hasSChange = true; }
                        if (!existing.social_about && sAbout) { sUpdate.social_about = sAbout; hasSChange = true; }
                        
                        if (hasSChange) {
                            sUpdate.updated_at = new Date().toISOString();
                            socialUpdates.push(sUpdate);
                        }
                    }
                }
            }

            // Target Spotify row for tracking
            spotifyRowUpdates.push({ id: profile.id, mf_check: new Date().toISOString() });

        } else {
            // Mark even on failure to avoid infinite loop
            spotifyRowUpdates.push({ id: profile.id, mf_check: new Date().toISOString() });
        }

        await sleep(SLEEP_MS);
    }

    // 🚀 EXECUTE BATCH DATABASE OPERATIONS
    if (talentUpdates.length > 0) {
        await supabase.from('talent_profiles').upsert(talentUpdates);
    }
    if (socialInserts.length > 0) {
        await supabase.from('social_profiles').insert(socialInserts);
    }
    if (socialUpdates.length > 0) {
        await supabase.from('social_profiles').upsert(socialUpdates);
    }
    if (spotifyRowUpdates.length > 0) {
        await supabase.from('social_profiles').upsert(spotifyRowUpdates);
    }

    console.log(`\n   ✅ Batch Complete: ${talentUpdates.length} Talent updates, ${socialInserts.length} Social inserts, ${socialUpdates.length} Social updates.`);

    return spotifyProfiles.length;
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

function askToken(): Promise<string> {
    return new Promise((resolve) => {
        rl.question('🔑 Please enter your MusicFetch API Token: ', (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('\n🎧 MusicFetch Master Linker & Talent Enricher (SUPER BATCHED)');
    console.log('============================================================');

    const token = await askToken();
    if (!token) {
        console.error('❌ Token is required to proceed.');
        process.exit(1);
    }

    let totalProcessed = 0;
    while (true) {
        const count = await processBatch(token);
        if (count === 0) break;
        totalProcessed += count;
        // console.log output is handled inside processBatch
    }
    console.log(`\n\n✨ Done! Enriched ${totalProcessed} artists.`);
    rl.close();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
