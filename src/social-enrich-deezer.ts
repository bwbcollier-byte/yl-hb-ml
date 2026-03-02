import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * DEEZER SOCIAL ENRICHER (RapidAPI Version - SUPER BATCHED)
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Deezer' AND status IS NULL
 * 2. Hits RapidAPI (deezerdevs) sequentially to respect rate limits.
 * 3. Accumulates all updates and performs ONE bulk database call at the end of the batch.
 */

const BATCH_SIZE = 50; 
const SLEEP_MS = 200; 
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const RAPID_API_KEYS = [
    '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
    '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
    'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
    '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460',
    '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241',
    '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00',
    '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
    'cea3641b50msh52581f483562ccdp186ee6jsn6759e8241393',
    '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9',
    '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4',
    '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7',
    'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13'
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

async function searchDeezerArtist(name: string): Promise<any> {
    const key = getNextKey();
    const url = `https://deezerdevs-deezer.p.rapidapi.com/search/artist?q=${encodeURIComponent(name)}`;

    try {
        const res = await fetch(url, {
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': key,
            },
        });

        if (res.status === 429) {
            console.log('\n   ⏳ Rate limited on Deezer search. Trying next...');
            return searchDeezerArtist(name);
        }

        if (!res.ok) return null;
        const data: any = await res.json();
        if (!data.data || data.data.length === 0) return null;
        
        const bestMatch = data.data.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
        return bestMatch || data.data[0];
    } catch {
        return null;
    }
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'Deezer')
        .or('status.is.null,status.neq.Done,status.neq.DONE,status.neq.Error')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Deezer profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    const socialUpdates: any[] = [];

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Deezer: ${profile.name || profile.social_id || profile.id}...`);

        let data = null;
        if (profile.social_id) {
            data = await fetchDeezerArtist(profile.social_id);
        } else if (profile.name) {
            data = await searchDeezerArtist(profile.name);
        }

        if (data) {
            const artistName = data.name || profile.name;
            const cleanUsername = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');

            socialUpdates.push({
                id: profile.id,
                name: artistName,
                social_id: data.id ? String(data.id) : profile.social_id,
                username: cleanUsername,
                social_image: data.picture_xl || data.picture_medium || null,
                followers_count: data.nb_fan || null,
                media_count: data.nb_album || null,
                social_url: data.link || `https://www.deezer.com/artist/${data.id || profile.social_id}`,
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

        } else {
            console.log(`   ❌ Failed: ${profile.name || profile.id} (No results or API error)`);
            socialUpdates.push({
                id: profile.id,
                status: 'Error',
                last_checked: new Date().toISOString(),
            });
        }

        await sleep(SLEEP_MS);
    }

    // 🚀 BULK UPDATE
    if (socialUpdates.length > 0) {
        const { error: updateError } = await supabase
            .from('social_profiles')
            .upsert(socialUpdates);
        
        if (updateError) {
            console.error('\n❌ Bulk Update Error:', updateError.message);
        } else {
            process.stdout.write(`\n   ✅ Batched ${socialUpdates.length} updates to DB.`);
        }
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 Deezer Social Profile Enricher (SUPER BATCHED)');
    console.log('================================================');

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('social_type', 'Deezer')
        .not('status', 'in', '("Done","Error")');

    console.log(`📊 Deezer profiles to enrich: ~${total || 0}`);

    let totalProcessed = 0;

    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   📊 Total processed: ${totalProcessed}`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Deezer social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
