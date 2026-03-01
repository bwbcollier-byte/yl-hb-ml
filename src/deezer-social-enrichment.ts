import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

const LIMIT = parseInt(process.env.LIMIT || '500');
const SLEEP_MS = 250; // Protect against rate limits

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getNextKey() {
    const key = RAPID_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % RAPID_API_KEYS.length;
    return key;
}

function cleanUsername(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchDeezerData(socialId: string) {
    const key = getNextKey();
    const url = `https://deezerdevs-deezer.p.rapidapi.com/artist/${socialId}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': key
            }
        });

        if (!response.ok) {
            console.error(`   ❌ API Error for ${socialId}: ${response.status} ${response.statusText}`);
            return null;
        }

        const data: any = await response.json();
        
        if (data.error) {
            console.error(`   ⚠️ API Response Error for ${socialId}:`, data.error.message);
            return null;
        }

        return data;
    } catch (err: any) {
        console.error(`   ❌ Network error for ${socialId}:`, err.message);
        return null;
    }
}

async function enrichDeezerProfiles() {
    console.log('🚀 Starting Deezer Social Profile Enrichment...');
    console.log(`📡 Using ${RAPID_API_KEYS.length} API keys in rotation.`);

    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, name')
        .eq('social_type', 'Deezer')
        .neq('status', 'Done')
        .not('social_id', 'is', null)
        .limit(LIMIT);

    if (error) {
        console.error('❌ Error fetching profiles:', error.message);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log('✅ No Deezer profiles found that need enrichment.');
        return;
    }

    console.log(`📦 Processing ${profiles.length} profiles...`);

    for (const profile of profiles) {
        console.log(`📋 Processing: ${profile.name || profile.social_id} (${profile.social_id})`);
        
        const deezerData = await fetchDeezerData(profile.social_id);
        
        if (deezerData) {
            const updatePayload = {
                name: deezerData.name,
                username: cleanUsername(deezerData.name),
                social_image: deezerData.picture_xl,
                followers_count: deezerData.nb_fan,
                media_count: deezerData.nb_album,
                is_verified: false,
                is_private: false,
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { error: updateError } = await supabase
                .from('social_profiles')
                .update(updatePayload)
                .eq('id', profile.id);

            if (updateError) {
                console.error(`   ❌ Update error for ${profile.id}:`, updateError.message);
            } else {
                console.log(`   ✅ Successfully updated ${deezerData.name}`);
            }
        }

        await sleep(SLEEP_MS);
    }

    console.log('\n==========================================');
    console.log('✨ Deezer Enrichment Round Complete!');
    console.log('==========================================\n');
}

enrichDeezerProfiles();
