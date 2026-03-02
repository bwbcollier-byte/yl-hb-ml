import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * MUSICBRAINZ SOCIAL ENRICHER
 * 
 * Reads from social_profiles WHERE social_type = 'MusicBrainz' AND status IS NULL
 * Gets the social_id (MBID) and hits the MusicBrainz API
 * Writes biography, country, tags/genres, image (wikidata), social links back to social_profiles
 * Also creates linked social_profiles for URLs discovered via MusicBrainz relations
 */

const BATCH_SIZE = 50; // MusicBrainz requires 1 req/sec, so we keep batches small for a predictable loop
const USER_AGENT = 'HBTalentMusicProfiles/1.0 (contact@yunikon-labs.com)';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Map from MusicBrainz URL relations → social_type in social_profiles
const URL_TYPE_MAP: Record<string, string> = {
    'instagram.com': 'Instagram',
    'facebook.com': 'Facebook',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'tiktok.com': 'TikTok',
    'twitter.com': 'Twitter',
    'x.com': 'Twitter',
    'soundcloud.com': 'Soundcloud',
    'open.spotify.com': 'Spotify',
    'music.apple.com': 'Apple Music',
    'deezer.com': 'Deezer',
    'tidal.com': 'Tidal',
    'pandora.com': 'Pandora',
    'discogs.com': 'Discogs',
    'allmusic.com': 'AllMusic',
    'bandsintown.com': 'Bandsintown',
    'songkick.com': 'Songkick',
    'bandcamp.com': 'Website',
};

function detectType(url: string): string | null {
    const lower = url.toLowerCase();
    for (const [domain, type] of Object.entries(URL_TYPE_MAP)) {
        if (lower.includes(domain)) return type;
    }
    return null;
}

async function fetchMBData(mbid: string): Promise<any> {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=aliases+tags+url-rels&fmt=json`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        await sleep(1100); // MusicBrainz requires 1 req/sec
        return data;
    } catch {
        return null;
    }
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, social_url, talent_id, name')
        .eq('social_type', 'MusicBrainz')
        .is('status', null)
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching MusicBrainz profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of (profiles as any[])) {
        // Extract just the MBID if it's stored as a URL
        let mbid = profile.social_id;
        const mbidMatch = mbid?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (mbidMatch) mbid = mbidMatch[1];

        if (!mbid) {
            await supabase.from('social_profiles').update({ status: 'Error' }).eq('id', profile.id);
            continue;
        }

        process.stdout.write(`\r   🎵 Processing ${profile.name || mbid}...`);

        const mbData = await fetchMBData(mbid);

        if (!mbData) {
            await supabase.from('social_profiles').update({ status: 'Error', last_checked: new Date().toISOString() }).eq('id', profile.id);
            continue;
        }

        // Build update for this social_profile row
        const tags = mbData.tags?.sort((a: any, b: any) => b.count - a.count).slice(0, 10).map((t: any) => t.name).join(', ') || null;
        const aliases = mbData.aliases?.map((a: any) => a.name).slice(0, 10).join(', ') || null;

        const profileUpdate: any = {
            name: mbData.name || profile.name,
            social_url: `https://musicbrainz.org/artist/${mbid}`,
            social_id: mbid, // clean MBID not URL
            social_about: [
                mbData.country ? `Country: ${mbData.country}` : null,
                mbData.disambiguation ? mbData.disambiguation : null,
                tags ? `Genres: ${tags}` : null,
                aliases ? `Also known as: ${aliases}` : null
            ].filter(Boolean).join(' | ') || null,
            status: 'Done',
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        await supabase.from('social_profiles').update(profileUpdate).eq('id', profile.id);

        // Discover social URLs from MusicBrainz relations and create new social_profiles if not already linked
        const relations = mbData.relations || [];
        const newSocials: any[] = [];

        for (const rel of relations) {
            const url = rel.url?.resource;
            if (!url) continue;

            const socialType = detectType(url);
            if (!socialType) continue;

            // Check this talent doesn't already have a social_profile for this type + url 
            const { data: existing } = await supabase
                .from('social_profiles')
                .select('id')
                .eq('talent_id', profile.talent_id)
                .eq('social_type', socialType)
                .eq('social_url', url)
                .maybeSingle();

            if (!existing) {
                newSocials.push({
                    talent_id: profile.talent_id,
                    social_type: socialType,
                    name: profile.name,
                    social_url: url,
                    status: null, // Will be picked up by the relevant enricher next
                    linking_status: 'done',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
            }
        }

        if (newSocials.length > 0) {
            const { error: insertErr } = await supabase.from('social_profiles').insert(newSocials);
            if (insertErr) console.error(`\n   ⚠️ Could not create new social links: ${insertErr.message}`);
            else process.stdout.write(`  +${newSocials.length} links discovered`);
        }
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 MusicBrainz Social Profile Enricher');
    console.log('=======================================');

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'MusicBrainz')
        .is('status', null);

    console.log(`📊 MusicBrainz profiles to enrich: ~${total || 0}`);
    console.log(`⏱️  ~1 req/sec per MusicBrainz policy`);

    let totalProcessed = 0;

    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        process.stdout.write(`\r   ✅ Total processed: ${totalProcessed}`);
    }

    console.log(`\n\n✨ Done! Enriched ${totalProcessed} MusicBrainz social profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
