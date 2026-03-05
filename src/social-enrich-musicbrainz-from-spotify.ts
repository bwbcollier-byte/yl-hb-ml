import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { supabase } from './supabase';

dotenv.config();

/**
 * MUSICBRAINZ FROM SPOTIFY ENRICHER
 * 
 * 1. Reads from social_profiles WHERE social_type = 'Spotify' AND status IS NULL (or via CLI args)
 * 2. Uses the Spotify URL to query MusicBrainz's URL endpoint
 * 3. Extracts the MusicBrainz Artist ID (MBID)
 * 4. Upserts the MBID into `talent_profiles` and creates a `MusicBrainz` record in `social_profiles`
 */

const BATCH_SIZE = 50; 
const USER_AGENT = 'HBTalentMusicProfiles/1.0 (contact@yunikon-labs.com)';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchMBIDFromSpotifyUrl(spotifyUrl: string): Promise<{mbid: string, name: string} | null> {
    const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        
        const data = await res.json();
        await sleep(1100); // 1 req/sec limit
        
        if (data.relations && data.relations.length > 0) {
            const artistRel = data.relations.find((r: any) => r['target-type'] === 'artist' || r.artist);
            if (artistRel && artistRel.artist) {
                return {
                    mbid: artistRel.artist.id,
                    name: artistRel.artist.name
                };
            }
        }
        return null; // URL exists but no artist linked
    } catch {
        return null;
    }
}

async function processProfile(profile: any) {
    let spotifyUrl = profile.social_url;
    if (!spotifyUrl && profile.social_id) {
        spotifyUrl = `https://open.spotify.com/artist/${profile.social_id}`;
    }

    if (!spotifyUrl) {
        await supabase.from('social_profiles').update({ status: 'Error_NoUrl' }).eq('id', profile.id);
        return false;
    }

    process.stdout.write(`\r   🎵 Checking MB for Spotify ID: ${profile.social_id}... `);

    const mbData = await fetchMBIDFromSpotifyUrl(spotifyUrl);

    if (!mbData) {
        // Mark as Not Found in MB or Error
        await supabase.from('social_profiles')
            .update({ status: 'MB_NotFound', last_checked: new Date().toISOString() })
            .eq('id', profile.id);
        console.log('❌ Not Found');
        return false;
    }

    console.log(`✅ Found MBID: ${mbData.mbid}`);

    // We found an MBID!
    // 1. Update the original Spotify social_profile to say 'Done'
    await supabase.from('social_profiles')
        .update({ 
            status: 'Done',
            last_checked: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

    // 2. Update talent_profiles with this MBID if it doesn't already have one
    const { data: talentData } = await supabase
        .from('talent_profiles')
        .select('musicbrainz_id')
        .eq('id', profile.talent_id)
        .maybeSingle();

    if (talentData && !talentData.musicbrainz_id) {
        await supabase.from('talent_profiles')
            .update({ musicbrainz_id: mbData.mbid, updated_at: new Date().toISOString() })
            .eq('id', profile.talent_id);
    }

    // 3. Create a new MusicBrainz social_profile if it doesn't exist
    const { data: existingMB } = await supabase
        .from('social_profiles')
        .select('id')
        .eq('talent_id', profile.talent_id)
        .eq('social_type', 'MusicBrainz')
        .maybeSingle();

    if (!existingMB) {
        const cleanUsername = mbData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        await supabase.from('social_profiles').insert({
            talent_id: profile.talent_id,
            social_type: 'MusicBrainz',
            social_id: mbData.mbid,
            name: mbData.name,
            username: cleanUsername,
            social_url: `https://musicbrainz.org/artist/${mbData.mbid}`,
            status: null, // Let the other MB enricher pick this up
            linking_status: 'done',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        console.log(`      + Added MusicBrainz profile to social_profiles`);
    }
    
    return true;
}

async function processBatch(): Promise<number> {
    const { data: profiles, error } = await supabase
        .from('social_profiles')
        .select('id, social_id, social_url, talent_id, name')
        .eq('social_type', 'Spotify')
        .is('status', null)
        .limit(BATCH_SIZE);

    if (error) {
        console.error('❌ Error fetching Spotify profiles:', error.message);
        return 0;
    }

    if (!profiles || profiles.length === 0) return 0;

    let successCount = 0;
    for (const profile of profiles) {
        const success = await processProfile(profile);
        if (success) successCount++;
    }

    return profiles.length;
}

async function processSpecific(queries: string[]) {
    console.log(`🔍 Processing specific queries: ${queries.join(', ')}`);
    for (const query of queries) {
        let isUrl = query.startsWith('http');
        let socialId = isUrl ? query.split('/').pop()?.split('?')[0] : query;
        
        const { data: profiles, error } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('social_type', 'Spotify')
            .eq('social_id', socialId);
            
        if (error || !profiles || profiles.length === 0) {
            console.log(`❌ No Spotify social_profile found for ID: ${socialId}`);
            continue;
        }
        
        for (const profile of profiles) {
            await processProfile(profile);
        }
    }
}

async function main() {
    console.log('\n🎵 MusicBrainz from Spotify Enricher');
    console.log('=======================================');

    // Parse CLI arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
        // e.g., --id 06HL4z0CvFAxyc27GXpf02 or --url https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02
        let targets = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--id' || args[i] === '--url') {
                if (args[i+1]) {
                    targets.push(args[i+1]);
                    i++;
                }
            } else if (!args[i].startsWith('--')) {
                targets.push(args[i]);
            }
        }
        
        if (targets.length > 0) {
            await processSpecific(targets);
            console.log('\n✨ Done processing specific records!');
            return;
        }
    }

    const { count: total } = await supabase
        .from('social_profiles')
        .select('id', { count: 'estimated', head: true })
        .eq('social_type', 'Spotify')
        .is('status', null);

    console.log(`📊 Spotify profiles to check against MB: ~${total || 0}`);
    console.log(`⏱️  ~1 req/sec per MusicBrainz policy`);

    let totalProcessed = 0;

    while (true) {
        const count = await processBatch();
        if (count === 0) break;
        totalProcessed += count;
        console.log(`✅ Total processed: ${totalProcessed}\n`);
    }

    console.log(`\n✨ Done! Processed ${totalProcessed} Spotify profiles.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
