import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * SPOTIFY SOCIAL ENRICHER (RapidAPI Version)
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Spotify' AND status IS NULL
 * 2. Hits RapidAPI (spotify81) to get full artist overview
 * 3. Updates the record with biography, followers, image, etc.
 * 4. Discovers and creates other social profiles (Facebook, Instagram, etc.) from externalLinks
 */

const BATCH_SIZE = 100;
const SLEEP_MS = 1000; // RapidAPI rate limits can be tight
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const RAPID_API_KEYS = [
    'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
    '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82', // The one you specifically provided
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

const PLATFORM_MAP: Record<string, string> = {
    'FACEBOOK': 'Facebook',
    'INSTAGRAM': 'Instagram',
    'TWITTER': 'Twitter',
    'X': 'Twitter',
    'WIKIPEDIA': 'Website',
    'YOUTUBE': 'YouTube',
    'SOUNDCLOUD': 'Soundcloud',
};

async function fetchSpotifyArtistOverview(spotifyId: string): Promise<any> {
    const key = getNextKey();
    const url = `https://spotify81.p.rapidapi.com/artist_overview?id=${spotifyId}`;

    try {
        const res = await fetch(url, {
            headers: {
                'x-rapidapi-host': 'spotify81.p.rapidapi.com',
                'x-rapidapi-key': key,
            },
        });

        if (res.status === 429) {
            console.log('\n   ⏳ Rate limited on this key. Trying next...');
            return fetchSpotifyArtistOverview(spotifyId);
        }

        if (!res.ok) return null;
        const data: any = await res.json();
        return data.data?.artist || null;
    } catch (error) {
        console.error(`\n❌ Network error for ${spotifyId}:`, (error as any).message);
        return null;
    }
}

function extractIdFromUrl(url: string, type: string): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/').filter(p => p.length > 0);
        
        if (type === 'Instagram' || type === 'Twitter' || type === 'Facebook' || type === 'TikTok') {
            return pathParts[0] || null;
        }
        if (type === 'YouTube') {
            if (pathParts[0] === 'channel' || pathParts[0] === 'user' || pathParts[0] === 'c') return pathParts[1] || null;
            if (pathParts[0]?.startsWith('@')) return pathParts[0];
            return pathParts[0] || null;
        }
    } catch {
        // Fallback for non-standard URLs
        const parts = url.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1] || null;
    }
    return null;
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'Spotify')
        .is('status', null)
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Spotify profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Processing: ${profile.name || profile.social_id}...`);

        const artist = await fetchSpotifyArtistOverview(profile.social_id!);

        if (artist) {
            // 1. Update the Spotify record itself
            const profile = artist.profile || {};
            const stats = artist.stats || {};
            const visuals = artist.visuals || {};

            const avatarUrl = visuals.avatarImage?.sources?.[0]?.url || null; // Avatar usually only has 1 main
            const bio = profile.biography?.text || null;
            const followers = stats.followers || null;
            const monthlyListeners = stats.monthlyListeners || null;
            const worldRank = stats.worldRank || null;
            const isVerified = profile.verified || false;

            // Gallery: Pick the largest source for each item
            const gallery = visuals.gallery?.items?.map((item: any) => {
                const sources = item.sources || [];
                // Sort by width descending to find the largest
                const largest = [...sources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                return largest?.url;
            }).filter(Boolean) || [];

            const topCities = stats.topCities?.items || [];
            
            const artistName = profile.name || profile.name;
            const cleanUsername = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');

            await supabase.from('social_profiles').update({
                name: artistName,
                username: cleanUsername,
                verified: isVerified,
                social_image: avatarUrl,
                social_about: bio ? bio.slice(0, 5000) : null,
                followers_count: followers,
                following: monthlyListeners, // Mapping monthlyListeners to following as requested
                social_rank: worldRank, // Mapping worldRank to rank
                images: gallery, 
                top_cities: topCities, 
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', profile.id);

            // 2. Discover and create other links
            const externalLinks = profile.externalLinks?.items || [];
            const newSocials: any[] = [];

            for (const link of externalLinks) {
                const platformName = link.name?.toUpperCase();
                const socialType = PLATFORM_MAP[platformName] || (platformName ? 'Website' : null);
                
                if (socialType && link.url) {
                    // Check if this talent already has this exact URL linked
                    const { data: existing } = await supabase
                        .from('social_profiles')
                        .select('id')
                        .eq('talent_id', profile.talent_id)
                        .eq('social_url', link.url)
                        .maybeSingle();

                    if (!existing) {
                        const extractedId = extractIdFromUrl(link.url, socialType);
                        newSocials.push({
                            talent_id: profile.talent_id,
                            social_type: socialType,
                            social_id: extractedId, // ID extracted from URL where possible
                            name: artistName,
                            username: cleanUsername,
                            social_url: link.url,
                            status: null, // Leave as null so the specialized enricher picks it up
                            linking_status: 'done',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            }

            if (newSocials.length > 0) {
                const { error: insertErr } = await supabase.from('social_profiles').insert(newSocials);
                if (insertErr) console.error(`\n   ⚠️ Could not insert discovered links: ${insertErr.message}`);
                else process.stdout.write(`  +${newSocials.length} links discovered`);
            }

        } else {
            await supabase.from('social_profiles').update({
                status: 'Error',
                last_checked: new Date().toISOString()
            }).eq('id', profile.id);
        }

        await sleep(SLEEP_MS);
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 Spotify Social Profile Enricher (RapidAPI Overview)');
    console.log('========================================================');

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
        process.stdout.write(`\r   ✅ Total processed this run: ${totalProcessed}`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Spotify social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
