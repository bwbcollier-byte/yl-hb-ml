import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * SPOTIFY SOCIAL ENRICHER (RapidAPI Version)
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Spotify' AND status IS NULL
 * 2. Hits RapidAPI (spotify81) to get full artist overview
 * 3. Updates the Social Profile record
 * 4. Discovers and Creates:
 *    - media_profiles (Albums/Singles)
 *    - event_profiles (Concerts)
 *    - talent_profiles (Related Artists Discovery)
 *    - other social_profiles (Links Discovery)
 */

const BATCH_SIZE = 50;
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
};

const RAPID_API_HOSTS = [
    'spotify81.p.rapidapi.com',
    'spotify23.p.rapidapi.com'
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
    const url = `https://${host}/artist_overview?id=${spotifyId}`;

    try {
        const res = await fetch(url, {
            headers: {
                'x-rapidapi-host': host,
                'x-rapidapi-key': key,
            },
        });

        if (res.status === 429) {
            console.log(`\n   ⏳ Rate limited on ${host}. Trying next...`);
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
        .not('status', 'in', '("Done","Error")') // Pick up active, pending, or null
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
            const apiProfile = artist.profile || {};
            const stats = artist.stats || {};
            const visuals = artist.visuals || {};

            const avatarUrl = visuals.avatarImage?.sources?.[0]?.url || null;
            const bio = apiProfile.biography?.text || null;
            const followers = stats.followers || null;
            const monthlyListeners = stats.monthlyListeners || null;
            const worldRank = stats.worldRank || null;
            const isVerified = apiProfile.verified || false;

            const gallery = visuals.gallery?.items?.map((item: any) => {
                const sources = item.sources || [];
                const largest = [...sources].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                return largest?.url;
            }).filter(Boolean) || [];

            const topCities = stats.topCities?.items || [];
            
            const artistName = apiProfile.name || profile.name;
            const cleanUsername = getCleanUsername(artistName);

            // 1. Update the Spotify record itself
            await supabase.from('social_profiles').update({
                name: artistName,
                username: cleanUsername,
                is_verified: isVerified,
                social_image: avatarUrl,
                social_about: bio ? bio.slice(0, 5000) : null,
                followers_count: followers,
                following: monthlyListeners,
                social_rank: worldRank,
                images: gallery, 
                top_cities: topCities, 
                status: 'Done',
                last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', profile.id);

            // 2. Media Profiles (Albums)
            const albums = artist.discography?.albums?.items || [];
            for (const albumGroup of albums) {
                const albumItems = albumGroup.releases?.items || [];
                for (const item of albumItems) {
                    if (!item.id) continue;
                    
                    const { data: existingMedia } = await supabase
                        .from('media_profiles')
                        .select('id')
                        .eq('spotify_album_id', item.id)
                        .maybeSingle();

                    if (!existingMedia) {
                        const coverArt = item.coverArt?.sources || [];
                        const largestCover = [...coverArt].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
                        
                        await supabase.from('media_profiles').insert({
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
                }
            }

            // 3. Event Profiles (Concerts)
            const concerts = artist.goods?.events?.concerts?.items || [];
            for (const concert of concerts) {
                if (!concert.id) continue;

                const { data: existingEvent } = await supabase
                    .from('event_profiles')
                    .select('id')
                    .eq('spotify_id', concert.id)
                    .maybeSingle();

                if (!existingEvent) {
                    await supabase.from('event_profiles').insert({
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
            }

            // 4. Talent Discovery (Related Artists)
            const related = artist.relatedContent?.relatedArtists?.items || [];
            for (const rel of related) {
                if (!rel.id) continue;

                // Check if talent already exists via spotify_id
                const { data: existingTalent } = await supabase
                    .from('talent_profiles')
                    .select('id, soc_spotify')
                    .eq('spotify_id', rel.id)
                    .maybeSingle();

                if (!existingTalent) {
                    // Create Talent Profile
                    const relAvatar = rel.visuals?.avatarImage?.sources || [];
                    const largestRelAvatar = [...relAvatar].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];

                    const { data: newTalent, error: tErr } = await supabase
                        .from('talent_profiles')
                        .insert({
                            name: rel.profile?.name,
                            spotify_id: rel.id,
                            image_url: largestRelAvatar?.url || null,
                            created_at: new Date().toISOString()
                        })
                        .select()
                        .single();

                    if (newTalent) {
                        // Create associated Social Profile
                        const { data: newSoc, error: sErr } = await supabase
                            .from('social_profiles')
                            .insert({
                                talent_id: newTalent.id,
                                social_type: 'Spotify',
                                social_id: rel.id,
                                name: rel.profile?.name,
                                username: getCleanUsername(rel.profile?.name || ''),
                                social_url: `https://open.spotify.com/artist/${rel.id}`,
                                social_image: largestRelAvatar?.url || null,
                                linking_status: 'done',
                                created_at: new Date().toISOString()
                            })
                            .select()
                            .single();

                        if (newSoc) {
                            // Link back to talent
                            await supabase.from('talent_profiles')
                                .update({ soc_spotify: newSoc.id })
                                .eq('id', newTalent.id);
                        }
                    }
                }
            }

            // 5. External Links Discovery
            const externalLinks = apiProfile.externalLinks?.items || [];
            const newSocials: any[] = [];

            for (const link of externalLinks) {
                const platformName = link.name?.toUpperCase();
                const socialType = PLATFORM_MAP[platformName] || (platformName ? 'Website' : null);
                
                if (socialType && link.url) {
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
                            social_id: extractedId,
                            name: artistName,
                            username: cleanUsername,
                            social_url: link.url,
                            status: null,
                            linking_status: 'done',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            }

            if (newSocials.length > 0) {
                await supabase.from('social_profiles').insert(newSocials);
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
    console.log('\n🎵 Spotify Super-Enricher (Media, Events, Discovery)');
    console.log('=====================================================');

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
        process.stdout.write(`\r   ✅ Total processed this run: ${totalProcessed}`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} Spotify profiles and expanded the database.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
