import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * DEEZER SOCIAL ENRICHER (RapidAPI Version)
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Deezer' AND status IS NULL
 * 2. Hits RapidAPI (deezerdevs) to get artist data
 * 3. Updates record with image, followers, clean username
 * 4. (Note: Deezer API doesn't usually provide external links directly in the main artist call, 
 *    but we keep the structure consistent).
 */

const BATCH_SIZE = 100;
const SLEEP_MS = 200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const RAPID_API_KEYS = [
    'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
    '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
    '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
    'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
    '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460'
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
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': key,
            },
        });

        if (res.status === 429) {
            console.log('\n   ⏳ Rate limited on Deezer key. Trying next...');
            return fetchDeezerArtist(socialId);
        }

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
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'Deezer')
        .is('status', null)
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Deezer profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Processing: ${profile.name || profile.social_id}...`);

        const data = await fetchDeezerArtist(profile.social_id!);

        if (data) {
            const artistName = data.name || profile.name;
            const cleanUsername = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');

            await supabase.from('social_profiles').update({
                name: artistName,
                username: cleanUsername,
                social_image: data.picture_xl || data.picture_medium || null,
                followers_count: data.nb_fan || null,
                media_count: data.nb_album || null,
                social_url: data.link || `https://www.deezer.com/artist/${profile.social_id}`,
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', profile.id);

        } else {
            await supabase.from('social_profiles').update({
                status: 'Error',
                last_checked: new Date().toISOString(),
            }).eq('id', profile.id);
        }

        await sleep(SLEEP_MS);
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 Deezer Social Profile Enricher');
    console.log('===================================');

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
        process.stdout.write(`\r   ✅ Processed ${totalProcessed} Deezer profiles...`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Deezer social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
