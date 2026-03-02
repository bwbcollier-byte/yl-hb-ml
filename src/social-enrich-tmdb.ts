import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * TMDB SOCIAL ENRICHER (V1 - AUDIT & DISCOVERY)
 * 1. Fetches Biography, DOB, Hometown, and Photos.
 * 2. Discovers Instagram, Twitter, TikTok, and IMDb IDs.
 * 3. Enriches both social_profiles and talent_profiles.
 */

const TMDB_BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1OTJmOWU3YzcwOTI5ZmQ5MmIyYjI2ODVjODkzMDZhMyIsIm5iZiI6MTcwNjI2MTE3NC40NTQwMDAyLCJzdWIiOiI2NWIzN2FiNmIzMzE2YjAxNGFhMGFlNmMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.SiMVUzo0pkynQBEMFAllEY9HUus9MW6F127x39HC_P4';
const BATCH_SIZE = 40; 
const SLEEP_MS = 150; 
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const today = new Date().toLocaleDateString();

async function fetchTMDBPerson(personId: string) {
    const url = `https://api.themoviedb.org/3/person/${personId}?append_to_response=external_ids&language=en-US`;
    try {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${TMDB_BEARER_TOKEN}`,
                'accept': 'application/json'
            }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function processBatch(): Promise<number> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name, processed_updates')
        .eq('social_type', 'TMDB')
        .or(`last_processed.is.null,last_processed.lt.${yesterday}`)
        .order('last_processed', { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE);

    if (error || !profiles || profiles.length === 0) return 0;

    const socialUpdates: any[] = [];
    const talentUpdates: any[] = [];
    const discoveredSocials: any[] = [];

    for (const profile of profiles) {
        if (!profile.social_id) continue;

        const data = await fetchTMDBPerson(profile.social_id);

        if (data) {
            console.log(`   ✅ Enriched: ${data.name.padEnd(25)} | 🎂 ${data.birthday || 'N/A'}`);

            // 1. Prepare Social Update
            const logEntry = `${today} - Enriched Bio, Image, and discovered ${Object.keys(data.external_ids || {}).length} external IDs.`;
            socialUpdates.push({
                id: profile.id,
                name: data.name,
                social_image: data.profile_path ? `https://image.tmdb.org/t/p/original${data.profile_path}` : null,
                social_about: data.biography || null,
                status: 'done',
                last_processed: new Date().toISOString(),
                processed_updates: profile.processed_updates ? `${logEntry}\n${profile.processed_updates}` : logEntry
            });

            // 2. Prepare Talent Enrichment (DOB / Hometown)
            if (profile.talent_id && (data.birthday || data.place_of_birth)) {
                talentUpdates.push({
                    id: profile.talent_id,
                    dob: data.birthday || null,
                    hometown: data.place_of_birth || null
                });
            }

            // 3. Prepare Discovery (Instagram, Twitter, etc)
            if (profile.talent_id && data.external_ids) {
                const ext = data.external_ids;
                const mapping = [
                    { type: 'Instagram', id: ext.instagram_id, url: `https://instagram.com/${ext.instagram_id}` },
                    { type: 'Twitter', id: ext.twitter_id, url: `https://twitter.com/${ext.twitter_id}` },
                    { type: 'TikTok', id: ext.tiktok_id, url: `https://tiktok.com/@${ext.tiktok_id}` },
                    { type: 'IMDb', id: ext.imdb_id, url: `https://imdb.com/name/${ext.imdb_id}` }
                ];

                for (const m of mapping) {
                    if (m.id) {
                        discoveredSocials.push({
                            talent_id: profile.talent_id,
                            social_type: m.type,
                            social_id: m.id,
                            social_url: m.url,
                            status: 'pending_verification'
                        });
                    }
                }
            }

        } else {
            console.log(`   ❌ Failed:   ${(profile.name || profile.social_id).slice(0, 25)}`);
            socialUpdates.push({
                id: profile.id,
                status: 'error',
                last_processed: new Date().toISOString(),
                processed_updates: `${today} - Failed: Person ID not found on TMDB.`
            });
        }
        await sleep(SLEEP_MS);
    }

    // 🚀 BULK SAVING
    if (socialUpdates.length > 0) await supabase.from('social_profiles').upsert(socialUpdates);
    if (talentUpdates.length > 0) await supabase.from('talent_profiles').upsert(talentUpdates);
    if (discoveredSocials.length > 0) await supabase.from('social_profiles').upsert(discoveredSocials, { onConflict: 'talent_id, social_type' });

    return profiles.length;
}

async function main() {
    console.log('\n🎬 TMDb Social Profile Enricher (V1 - AUDIT & DISCOVERY)');
    console.log('========================================================');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('social_type', 'TMDB')
        .or(`last_processed.is.null,last_processed.lt.${yesterday}`);

    console.log(`📊 TMDB profiles to refresh: ~${total || 0}`);

    let processed = 0;
    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        processed += count;
        console.log(`   📉 Progress: ${processed} processed...`);
    }
    console.log(`\n\n✨ Done! Enriched ${processed} TMDb profiles.`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
