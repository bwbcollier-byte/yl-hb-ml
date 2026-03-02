import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * AUDIODB SOCIAL ENRICHER
 * 
 * Reads from social_profiles WHERE social_type = 'MusicBrainz' AND status = 'Done'
 * (AudioDB uses MusicBrainz IDs as its lookup key)
 * Gets the social_id (MBID) and hits TheAudioDB API
 * Creates or updates a social_profiles row with social_type = 'AudioDB'
 * Writes biography, images, genre, country back to that AudioDB row
 */

const BATCH_SIZE = 100;
const AUDIODB_API_KEY = process.env.AUDIODB_API_KEY || '925704';
const SLEEP_MS = 1000; // Be polite to TheAudioDB
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchAudioDBArtist(mbid: string): Promise<any> {
    const url = `https://www.theaudiodb.com/api/v1/json/${AUDIODB_API_KEY}/artist-mb.php?i=${mbid}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data: any = await res.json();
        return data.artists?.[0] || null;
    } catch {
        return null;
    }
}

async function fetchAudioDBSocials(adbId: string): Promise<any> {
    const url = `https://www.theaudiodb.com/api/v1/json/${AUDIODB_API_KEY}/artist-social.php?i=${adbId}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data: any = await res.json();
        return data.socials?.[0] || null;
    } catch {
        return null;
    }
}

async function processBatch(offset: number): Promise<number> {
    // We use processed MusicBrainz records as our source of MBIDs
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, talent_id, name')
        .eq('social_type', 'MusicBrainz')
        .eq('status', 'Done')
        .not('social_id', 'is', null)
        .neq('social_id', '')
        .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
        console.error('❌ Error fetching MusicBrainz profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    for (const profile of (profiles as any[])) {
        const mbid = profile.social_id;
        process.stdout.write(`\r   🎵 Checking AudioDB for ${profile.name || mbid}...`);

        // Check if this talent already has an AudioDB social_profile
        const { data: existing } = await supabase
            .from('social_profiles')
            .select('id, status')
            .eq('talent_id', profile.talent_id)
            .eq('social_type', 'AudioDB')
            .maybeSingle();

        if (existing?.status === 'Done') {
            continue; // Already done
        }

        const adbData = await fetchAudioDBArtist(mbid);

        if (!adbData) {
            await sleep(SLEEP_MS);
            continue; // No AudioDB record for this MBID
        }

        // Fetch social info too
        const socialData = await fetchAudioDBSocials(adbData.idArtist);
        await sleep(SLEEP_MS);

        const adbRow: any = {
            talent_id: profile.talent_id,
            social_type: 'AudioDB',
            name: adbData.strArtist || profile.name,
            social_id: adbData.idArtist,
            social_url: `https://www.theaudiodb.com/artist/${adbData.idArtist}`,
            social_image: adbData.strArtistThumb || adbData.strArtistFanart || null,
            social_about: [
                adbData.strBiographyEN ? adbData.strBiographyEN.slice(0, 500) : null,
                adbData.strGenre ? `Genre: ${adbData.strGenre}` : null,
                adbData.strCountry ? `Country: ${adbData.strCountry}` : null,
                adbData.strStyle ? `Style: ${adbData.strStyle}` : null,
            ].filter(Boolean).join(' | ') || null,
            status: 'Done',
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            linking_status: 'done',
        };

        // Add social links discovered from AudioDB
        if (socialData) {
            // We just store the info in the AudioDB row's about field for now
            const foundLinks = [
                socialData.strFacebook ? `Facebook: ${socialData.strFacebook}` : null,
                socialData.strTwitter ? `Twitter: ${socialData.strTwitter}` : null,
                socialData.strInstagram ? `Instagram: ${socialData.strInstagram}` : null,
            ].filter(Boolean).join(', ');
            if (foundLinks) adbRow.social_about = (adbRow.social_about || '') + ` | Links: ${foundLinks}`;
        }

        if (existing) {
            await supabase.from('social_profiles').update(adbRow).eq('id', existing.id);
        } else {
            adbRow.created_at = new Date().toISOString();
            await supabase.from('social_profiles').insert(adbRow);
        }
    }

    return profiles.length;
}

async function main() {
    console.log('\n🎵 TheAudioDB Social Profile Enricher');
    console.log('======================================');
    console.log(`📡 Using AudioDB API key: ${AUDIODB_API_KEY}`);

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'MusicBrainz')
        .eq('status', 'Done');

    console.log(`📊 MusicBrainz profiles available to cross-reference: ~${total || 0}`);

    let totalProcessed = 0;
    let offset = 0;

    while (true) {
        const count = await processBatch(offset);
        if (count === 0) break;
        totalProcessed += count;
        offset += count;
        process.stdout.write(`\r   ✅ Checked ${totalProcessed} of ~${total} profiles...`);
    }

    console.log(`\n\n✨ Done! Processed ${totalProcessed} artists via TheAudioDB.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
