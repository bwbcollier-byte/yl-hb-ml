import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';
import readline from 'readline';

dotenv.config();

/**
 * MUSICFETCH MASTER ENRICHER (V2.1)
 * 
 * 1. Finds Spotify profiles where mf_check is NULL
 * 2. Hits MusicFetch API with deep-field parameters
 * 3. Actions:
 *    - Creates a 'MusicFetch' social_profile if not exists (using Spotify ID/URL)
 *    - Store the 'social_about' on the NEW MusicFetch record
 *    - Discovers and CREATES/LINKS all other platform records (Deezer, Apple, etc.)
 *    - Updates talent_profiles (dob, hometown, aliases)
 *    - MARKS original Spotify record as mf_check = NOW()
 * 
 * Rate Limit: ~40 reqs/min (using 1.6s delay)
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
    const { data: profiles, error } = await supabase
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

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of profiles) {
        process.stdout.write(`\r   🔍 MusicFetch: ${profile.name || profile.id}...`);
        
        const data = await fetchMusicFetch(profile.social_url!, token);
        const result = data?.result;

        if (result) {
            // 1. Create/Update MusicFetch social_profile
            const { data: existingMF } = await supabase
                .from('social_profiles')
                .select('id')
                .eq('talent_id', profile.talent_id)
                .eq('social_type', 'MusicFetch')
                .maybeSingle();

            if (!existingMF) {
                await supabase.from('social_profiles').insert({
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
                console.log(`   ✨ Created MusicFetch profile (Bio/About stored)`);
            } else {
                await supabase.from('social_profiles').update({
                    social_about: result.description,
                    social_image: result.image?.url,
                    updated_at: new Date().toISOString()
                }).eq('id', existingMF.id);
                console.log(`   📝 Updated MusicFetch profile (Bio/About refreshed)`);
            }

            // 2. Update Talent Metadata
            const talentUpdate: any = {};
            if (result.dateOfBirth) talentUpdate.dob = result.dateOfBirth;
            if (result.hometown) talentUpdate.hometown = result.hometown;
            if (result.aliases && Array.isArray(result.aliases)) talentUpdate.aliases = result.aliases;
            
            if (Object.keys(talentUpdate).length > 0) {
                await supabase.from('talent_profiles').update(talentUpdate).eq('id', profile.talent_id);
                console.log(`   👤 Updated Talent: ${Object.keys(talentUpdate).join(', ')}`);
            }

            // 3. Discovery/Linking (All other platforms)
            const services = result.services || {};
            for (const [sKey, sData] of Object.entries(services) as [string, any][]) {
                const sType = mapServiceToType(sKey);
                if (!sType || sType === 'Spotify' || sType === 'MusicFetch') continue;

                const url = sData.link || (sData.links && sData.links[0]?.url);
                const sId = sData.id ? String(sData.id) : null;
                const sImg = sData.images?.[0]?.url || sData.image?.url;
                const sAbout = sData.description;

                if (url || sId) {
                    const { data: existing } = await supabase
                        .from('social_profiles')
                        .select('id, social_id, social_url, social_image, social_about')
                        .eq('talent_id', profile.talent_id)
                        .eq('social_type', sType)
                        .maybeSingle();

                    if (!existing) {
                        // CREATE NEW RECORD
                        await supabase.from('social_profiles').insert({
                            talent_id: profile.talent_id,
                            social_type: sType,
                            social_id: sId,
                            social_url: url,
                            social_image: sImg,
                            social_about: sAbout,
                            name: profile.name,
                            linking_status: 'done',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                        console.log(`   ✨ Created ${sType} (ID: ${sId || 'URL only'})`);
                    } else {
                        // UPDATE MISSING VALUES
                        const updateObj: any = {};
                        if (!existing.social_id && sId) updateObj.social_id = sId;
                        if (!existing.social_url && url) updateObj.social_url = url;
                        if (!existing.social_image && sImg) updateObj.social_image = sImg;
                        if (!existing.social_about && sAbout) updateObj.social_about = sAbout;
                        
                        if (Object.keys(updateObj).length > 0) {
                            await supabase.from('social_profiles').update({
                                ...updateObj,
                                updated_at: new Date().toISOString()
                            }).eq('id', existing.id);
                            console.log(`   🔄 Updated ${sType}: ${Object.keys(updateObj).join(', ')}`);
                        }
                    }
                }
            }

            // 4. Mark Spotify record as checked
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

function askToken(): Promise<string> {
    return new Promise((resolve) => {
        rl.question('🔑 Please enter your MusicFetch API Token: ', (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('\n🎧 MusicFetch Master Linker & Talent Enricher');
    console.log('============================================');

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
        process.stdout.write(`\r   ✅ Total Spotify profiles checked: ${totalProcessed}`);
    }
    console.log(`\n\n✨ Done! Enriched ${totalProcessed} artists.`);
    rl.close();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
