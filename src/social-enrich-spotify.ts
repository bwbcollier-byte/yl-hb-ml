import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * SPOTIFY SOCIAL ENRICHER
 * 
 * Reads from social_profiles WHERE social_type = 'Spotify' AND status IS NULL
 * Gets the social_id (Spotify Artist ID) and hits the Spotify API
 * Writes image, followers, popularity, genres back to social_profiles
 */

const BATCH_SIZE = 500;
const SLEEP_MS = 100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let spotifyToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
    if (spotifyToken && Date.now() < tokenExpiry) return spotifyToken;

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
    }

    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    const data: any = await res.json();
    spotifyToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken!;
}

async function fetchSpotifyArtist(spotifyId: string): Promise<any> {
    const token = await getSpotifyToken();
    const res = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        console.log(`\n   ⏳ Rate limited. Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        return fetchSpotifyArtist(spotifyId);
    }

    if (!res.ok) return null;
    return res.json();
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, name')
        .eq('social_type', 'Spotify')
        .is('status', null)
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Spotify social profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    const updates: any[] = [];

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Processing: ${profile.name || profile.social_id}...`);

        const data = await fetchSpotifyArtist(profile.social_id!);

        if (data) {
            updates.push({
                id: profile.id,
                name: data.name || profile.name,
                username: data.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || null,
                social_image: data.images?.[0]?.url || null,
                followers_count: data.followers?.total || null,
                social_rank: data.popularity || null,
                social_about: data.genres?.join(', ') || null,
                social_url: `https://open.spotify.com/artist/${profile.social_id}`,
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

    // Save in chunks
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const { error: saveError } = await supabase.from('social_profiles').upsert(chunk);
        if (saveError) console.error('\n❌ Error saving batch:', saveError.message);
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 Spotify Social Profile Enricher');
    console.log('===================================');

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'Spotify')
        .is('status', null);

    console.log(`📊 Spotify profiles to enrich: ~${total || 0}`);

    let totalProcessed = 0;

    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   ✅ Processed ${totalProcessed} Spotify profiles so far...`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Spotify social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
