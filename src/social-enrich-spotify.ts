import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * SPOTIFY SOCIAL ENRICHER (RapidAPI Version - SUPER BATCHED)
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Spotify' AND status IS NULL
 * 2. Hits RapidAPI sequentially to respect rate limits.
 * 3. Accumulates ALL discoveries (Albums, Events, Related Artists, Social Links).
 * 4. Per batch, performs BULK operations to merge/create records in the DB.
 */

const BATCH_SIZE = 20; // Reduced for stability during complex bulk ops
const SLEEP_MS = 1000;
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

const PLATFORM_MAP: Record<string, string> = {
    'FACEBOOK': 'Facebook',
    'INSTAGRAM': 'Instagram',
    'TWITTER': 'Twitter',
    'X': 'Twitter',
    'WIKIPEDIA': 'Website',
    'YOUTUBE': 'YouTube',
    'SOUNDCLOUD': 'Soundcloud',
    'DEEZER': 'Deezer',
    'TIKTOK': 'TikTok',
    'TIK TOK': 'TikTok',
};

const RAPID_API_HOSTS = [
    'spotify81.p.rapidapi.com',
    'spotify23.p.rapidapi.com',
    'spotify-data.p.rapidapi.com',
    'spotify-web-api3.p.rapidapi.com',
    'real-time-spotify-data-scraper.p.rapidapi.com',
    'spotify-web2.p.rapidapi.com'
];

let currentHostIndex = 0;
function getNextHost() {
    const host = RAPID_API_HOSTS[currentHostIndex];
    currentHostIndex = (currentHostIndex + 1) % RAPID_API_HOSTS.length;
    return host;
}

async function fetchSpotifyArtistOverview(spotifyId: string): Promise<any> {
    const key = getNextKey();
    const host = getNextHost();
    
    let url = `https://${host}/artist_overview/?id=${spotifyId}`;
    let options: any = {
        headers: {
            'x-rapidapi-host': host,
            'x-rapidapi-key': key,
        }
    };

    if (host === 'spotify-web-api3.p.rapidapi.com') {
        url = `https://${host}/v1/social/spotify/getartist`;
        options = {
            method: 'POST',
            headers: {
                ...options.headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: spotifyId })
        };
    }

    try {
        const res = await fetch(url, options);
        if (res.status === 429) {
            console.log(`\n   ⏳ Rate limited on ${host}. Trying next...`);
            return fetchSpotifyArtistOverview(spotifyId);
        }
        if (!res.ok) return null;
        const data: any = await res.json();
        return data.data?.artist || data.data?.artistUnion || null;
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
        if (['Instagram', 'Twitter', 'Facebook', 'TikTok'].includes(type)) return pathParts[0] || null;
        if (type === 'YouTube') {
            if (['channel', 'user', 'c'].includes(pathParts[0])) return pathParts[1] || null;
            if (pathParts[0]?.startsWith('@')) return pathParts[0];
            return pathParts[0] || null;
        }
    } catch {
        const parts = url.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1] || null;
    }
    return null;
}

function getCleanUsername(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'Spotify')
        .not('status', 'in', '("Done","Error")')
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Spotify profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    // PRE-FETCH EXTERNALS
    const talentIds = profiles.map(p => p.talent_id);
    const { data: existingSocials } = await supabase.from('social_profiles').select('id, talent_id, social_type, social_id, status').in('talent_id', talentIds);
    const { data: existingTalents } = await supabase.from('talent_profiles').select('id, spotify_id').in('talent_id', talentIds); // Note: we'll also check rel artists later
    
    const socialMap = new Map<string, any>();
    existingSocials?.forEach(s => socialMap.set(`${s.talent_id}_${s.social_type}`, s));

    const socialUpdates: any[] = [];
    const mediaInserts: any[] = [];
    const eventInserts: any[] = [];
    const talentUpdates: any[] = [];
    const talentInserts: any[] = [];

    for (const profile of profiles) {
        process.stdout.write(`\r   🎵 Spotify: ${profile.name || profile.social_id}...`);

        const artist = await fetchSpotifyArtistOverview(profile.social_id!);
        if (artist) {
            const apiProfile = artist.profile || {};
            const stats = artist.stats || {};
            const visuals = artist.visuals || {};

            const avatarSources = visuals.avatarImage?.sources || [];
            const largestAvatar = [...avatarSources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
            const artistName = apiProfile.name || profile.name;
            const cleanUsername = getCleanUsername(artistName);

            // 1. Accumulate Main Profile Update
            socialUpdates.push({
                id: profile.id,
                name: artistName,
                username: cleanUsername,
                is_verified: apiProfile.verified || false,
                social_image: largestAvatar?.url || null,
                social_about: apiProfile.biography?.text ? apiProfile.biography.text.slice(0, 5000) : null,
                followers_count: stats.followers || null,
                following: stats.monthlyListeners || null,
                social_rank: stats.worldRank || null,
                images: visuals.gallery?.items?.map((item: any) => {
                    const sources = item.sources || [];
                    const largest = [...sources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                    return largest?.url;
                }).filter(Boolean) || [],
                top_cities: stats.topCities?.items || [],
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            // 2. Accumulate Media (Albums)
            const albums = artist.discography?.albums?.items || [];
            albums.forEach((group: any) => {
                group.releases?.items?.forEach((item: any) => {
                    if (item.id) {
                        const coverArt = item.coverArt?.sources || [];
                        const largestCover = [...coverArt].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                        mediaInserts.push({
                            talent_id: profile.talent_id,
                            name: item.name,
                            media_type: item.type === 'ALBUM' ? 'Album' : 'Single',
                            spotify_album_id: item.id,
                            media_url: `https://open.spotify.com/album/${item.id}`,
                            image_url: largestCover?.url || null,
                            release_date: item.date ? `${item.date.year}-${String(item.date.month || 1).padStart(2, '0')}-${String(item.date.day || 1).padStart(2, '0')}` : null,
                            label: item.label || null,
                            created_at: new Date().toISOString()
                        });
                    }
                });
            });

            // 3. Accumulate Events
            const concerts = artist.goods?.events?.concerts?.items || [];
            concerts.forEach((concert: any) => {
                if (concert.id) {
                    eventInserts.push({
                        talent_id: profile.talent_id,
                        name: concert.title || artistName,
                        event_type: concert.category || 'Concert',
                        spotify_id: concert.id,
                        event_url: `https://open.spotify.com/concert/${concert.id}`,
                        venue_name: concert.venue?.name || null,
                        location_name: concert.venue?.location?.name || null,
                        latitude: concert.venue?.location?.coordinates?.latitude || null,
                        longitude: concert.venue?.location?.coordinates?.longitude || null,
                        start_date: concert.date?.isoString || null,
                        created_at: new Date().toISOString()
                    });
                }
            });

            // 4. Accumulate Social Links
            const externalLinks = apiProfile.externalLinks?.items || [];
            externalLinks.forEach((link: any) => {
                const sType = PLATFORM_MAP[link.name?.toUpperCase()] || (link.name ? 'Website' : null);
                if (sType && link.url) {
                    const existing = socialMap.get(`${profile.talent_id}_${sType}`);
                    if (!existing) {
                        socialUpdates.push({
                            talent_id: profile.talent_id,
                            social_type: sType,
                            social_id: extractIdFromUrl(link.url, sType),
                            name: artistName,
                            social_url: link.url,
                            status: null,
                            linking_status: 'done',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    } else if (!existing.social_id || existing.status !== 'Done') {
                        const extractedId = extractIdFromUrl(link.url, sType);
                        if (extractedId) {
                            socialUpdates.push({
                                id: existing.id,
                                social_id: extractedId,
                                social_url: link.url,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                }
            });

        } else {
            socialUpdates.push({ id: profile.id, status: 'Error', last_checked: new Date().toISOString() });
        }
        await sleep(SLEEP_MS);
    }

    // 🔥 EXECUTE BULK OPERATIONS
    if (socialUpdates.length > 0) {
        await supabase.from('social_profiles').upsert(socialUpdates);
    }
    if (mediaInserts.length > 0) {
        // Media and Events use IDs that might conflict, we use upsert with onConflict if possible, 
        // or just insert knowing that some might fail (Supabase insert will error on duplicates, better to use upsert)
        await supabase.from('media_profiles').upsert(mediaInserts, { onConflict: 'spotify_album_id' });
    }
    if (eventInserts.length > 0) {
        await supabase.from('event_profiles').upsert(eventInserts, { onConflict: 'spotify_id' });
    }

    console.log(`\n   ✅ Batched: ${socialUpdates.length} Socials, ${mediaInserts.length} Media, ${eventInserts.length} Events.`);
    return profiles.length;
}

async function main() {
    console.log('\n🎵 Spotify Super-Enricher (SUPER BATCHED)');
    console.log('==========================================');

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'Spotify')
        .not('status', 'in', '("Done","Error")');

    console.log(`📊 Spotify profiles to process: ~${total || 0}`);

    let totalProcessed = 0;
    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   ✅ Total processed: ${totalProcessed}`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Spotify profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
