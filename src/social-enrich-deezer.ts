import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * DEEZER SOCIAL ENRICHER
 * 
 * Reads from social_profiles WHERE social_type = 'Deezer' AND status IS NULL
 * Gets the social_id (Deezer Artist ID) and hits the Deezer API via RapidAPI
 * Writes image, followers, album count back to social_profiles
 */

const BATCH_SIZE = 500;
const SLEEP_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const RAPID_API_KEYS = [
    'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
    '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
    '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
    'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
    '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460',
    '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241',
    '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00',
    '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9',
    '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4',
    '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7'
];

let currentKeyIndex = 0;
function getNextKey() {
    const key = RAPID_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % RAPID_API_KEYS.length;
    return key;
}

async function fetchDeezerArtist(socialId: string): Promise<any> {
    const key = getNextKey();
    const url = `https://deezerdevs-deezer.p.rapidapi.com/artist/${socialId}`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': key,
            },
        });

        if (!res.ok) return null;
        const data: any = await res.json();
        if (data.error) return null;
        return data;
    } catch {
        return null;
    }
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, name')
        .eq('social_type', 'Deezer')
        .is('status', null)
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Deezer social profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    const updates: any[] = [];

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Processing: ${profile.name || profile.social_id}...`);

        const data = await fetchDeezerArtist(profile.social_id!);

        if (data) {
            updates.push({
                id: profile.id,
                name: data.name || profile.name,
                username: data.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || null,
                social_image: data.picture_xl || data.picture_medium || null,
                followers_count: data.nb_fan || null,
                media_count: data.nb_album || null,
                social_url: data.link || `https://www.deezer.com/artist/${profile.social_id}`,
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        } else {
            updates.push({
                id: profile.id,
                status: 'Error',
                last_checked: new Date().toISOString(),
            });
        }

        await sleep(SLEEP_MS);
    }

    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const { error: saveError } = await supabase.from('social_profiles').upsert(chunk);
        if (saveError) console.error('\n❌ Error saving batch:', saveError.message);
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 Deezer Social Profile Enricher');
    console.log('===================================');
    console.log(`📡 Using ${RAPID_API_KEYS.length} API keys in rotation.`);

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'Deezer')
        .is('status', null);

    console.log(`📊 Deezer profiles to enrich: ~${total || 0}`);

    let totalProcessed = 0;

    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   ✅ Processed ${totalProcessed} Deezer profiles so far...`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Deezer social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
