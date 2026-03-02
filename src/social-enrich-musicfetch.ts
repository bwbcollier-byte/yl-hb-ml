import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * MUSICFETCH SOCIAL ENRICHER
 * 
 * Reads from social_profiles WHERE social_type = 'Spotify' AND status = 'Done'
 * Gets the social_id (Spotify Artist ID) and hits the MusicFetch API
 * For EACH platform link returned by MusicFetch, it creates/updates the matching
 * social_profiles row for that talent (e.g. their Deezer row, Instagram row, etc.)
 * This ONLY updates social_profiles — NOT talent_profiles
 */

const BATCH_SIZE = 100;
const SLEEP_MS = 2100; // MusicFetch: ~28 req/min (using 2.1s to be safe)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const MUSICFETCH_TOKEN = process.env.MUSICFETCH_TOKEN;

// Map MusicFetch service keys → social_type in social_profiles
const MF_TYPE_MAP: Record<string, string> = {
    appleMusic: 'Apple Music',
    instagram: 'Instagram',
    facebook: 'Facebook',
    twitter: 'Twitter',
    x: 'Twitter',
    youtube: 'YouTube',
    youtubeMusic: 'YouTube',
    tiktok: 'TikTok',
    soundcloud: 'Soundcloud',
    deezer: 'Deezer',
    tidal: 'Tidal',
    pandora: 'Pandora',
    audiomack: 'Website',
    beatport: 'Website',
    bandcamp: 'Website',
    discogs: 'Discogs',
    genius: 'Website',
    iHeartRadio: 'Website',
    amazonMusic: 'Website',
    amazon: 'Website',
    wikipedia: 'Website',
};

async function fetchMusicFetch(spotifyId: string): Promise<any> {
    if (!MUSICFETCH_TOKEN) throw new Error('Missing MUSICFETCH_TOKEN in .env');

    const spotifyUrl = `https://open.spotify.com/artist/${spotifyId}`;
    const services = 'spotify,amazon,youtubeMusic,youtube,audiomack,bandcamp,beatport,deezer,discogs,genius,iHeartRadio,appleMusic,instagram,pandora,soundcloud,tidal,tiktok,x,wikipedia';
    const url = `https://api.musicfetch.io/url?url=${encodeURIComponent(spotifyUrl)}&services=${encodeURIComponent(services)}&country=US&withTracks=false`;

    const res = await fetch(url, { headers: { 'x-token': MUSICFETCH_TOKEN } });

    if (res.status === 429) {
        await sleep(5000);
        return fetchMusicFetch(spotifyId);
    }

    if (res.status === 401 || res.status === 403) throw new Error('Invalid or expired MusicFetch token');
    if (!res.ok) return null;

    const data: any = await res.json();
    return data.result;
}

async function processBatch(offset: number): Promise<number> {
    // Source: Spotify social_profiles that have already been enriched (we have their Spotify ID confirmed)
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'Spotify')
        .eq('status', 'Done')
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
        console.error('❌ Error fetching Spotify profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of (profiles as any[])) {
        process.stdout.write(`\r   🔗 MusicFetch: ${profile.name || profile.social_id}...`);

        let mfData: any;
        try {
            mfData = await fetchMusicFetch(profile.social_id!);
        } catch (err: any) {
            console.error(`\n❌ Fatal: ${err.message}`);
            break;
        }

        await sleep(SLEEP_MS);

        if (!mfData?.services) continue;

        // For each platform returned, check if the talent already has a social_profile for it
        // If not, create one. If yes and it doesn't have a URL, update it.
        const upserts: any[] = [];

        for (const [mfKey, serviceData] of Object.entries(mfData.services)) {
            const link = (serviceData as any)?.link;
            if (!link) continue;

            const socialType = MF_TYPE_MAP[mfKey];
            if (!socialType) continue;

            // Check if row already exists for this talent+type
            const { data: existing } = await supabase
                .from('social_profiles')
                .select('id, social_url')
                .eq('talent_id', profile.talent_id)
                .eq('social_type', socialType)
                .maybeSingle();

            if (existing) {
                // Only update URL if it's missing
                if (!existing.social_url) {
                    upserts.push({ id: existing.id, social_url: link, updated_at: new Date().toISOString() });
                }
            } else {
                // Create a brand new social_profile row for this platform
                upserts.push({
                    talent_id: profile.talent_id,
                    social_type: socialType,
                    name: profile.name,
                    social_url: link,
                    status: null, // Will be picked up by the specific enricher for this platform
                    linking_status: 'done',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
            }
        }

        if (upserts.length > 0) {
            const toInsert = upserts.filter(u => !u.id);
            const toUpdate = upserts.filter(u => u.id);

            if (toInsert.length > 0) {
                const { error: insertErr } = await supabase.from('social_profiles').insert(toInsert);
                if (insertErr) console.error(`\n   ⚠️ Insert error: ${insertErr.message}`);
            }
            if (toUpdate.length > 0) {
                for (const row of toUpdate) {
                    await supabase.from('social_profiles').update({ social_url: row.social_url, updated_at: row.updated_at }).eq('id', row.id);
                }
            }
        }
    }

    return profiles.length;
}

async function main() {
    if (!MUSICFETCH_TOKEN) {
        console.error('❌ Missing MUSICFETCH_TOKEN in .env file!');
        process.exit(1);
    }

    console.log('\n🎵 MusicFetch Social Profile Enricher');
    console.log('======================================');
    console.log(`🔑 MusicFetch token: ${MUSICFETCH_TOKEN.substring(0, 8)}...`);

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'Spotify')
        .eq('status', 'Done');

    console.log(`📊 Enriched Spotify profiles to process: ~${total || 0}`);
    console.log(`⏱️  ~28 req/min (2.1s delay between requests)`);

    let totalProcessed = 0;
    let offset = 0;

    while (true) {
        const count = await processBatch(offset);
        if (count === 0) break;
        totalProcessed += count;
        offset += count;
        process.stdout.write(`\r   ✅ Processed ${totalProcessed} of ~${total} Spotify profiles...`);
    }

    console.log(`\n\n✨ Done! Processed ${totalProcessed} artists via MusicFetch.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
