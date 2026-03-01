import { supabase } from './supabase';

/**
 * MASTER MIGRATION SCRIPT
 * From talent_profiles (250+ columns) to social_profiles (Normalized Table)
 * 
 * Safely processes all 60,000+ records in batches to avoid Supabase timeouts.
 */

const BATCH_SIZE = 500; // Talent records to fetch per round
const SAVE_BATCH_SIZE = 200; // Social records to save per round

// Helper to strip numbers from strings (handles "1,200,000" -> 1200000)
function parseCount(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).replace(/[^0-9]/g, '');
    const num = parseInt(clean, 10);
    return isNaN(num) ? null : num;
}

// Helper to convert rank/popularity strings to numbers
function parseRank(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

async function startMigration() {
    console.log('🚀 Social Profiles Migration Starting...');
    console.log('------------------------------------------');

    let processedCount = 0;
    let totalSocialsCreated = 0;
    let lastId = ''; // For keyset pagination (faster than offset)

    while (true) {
        // 1. Fetch a batch of talent records
        console.log(`📦 Fetching batch of ${BATCH_SIZE} talent profiles...`);
        let query = supabase
            .from('talent_profiles')
            .select('*')
            .order('id', { ascending: true })
            .limit(BATCH_SIZE);
        
        if (lastId) {
            query = query.gt('id', lastId);
        }

        const { data: talentBatch, error } = await query;

        if (error) {
            console.error('❌ Error fetching talent records:', error.message);
            break;
        }

        if (!talentBatch || talentBatch.length === 0) {
            console.log('✅ All records have been scanned!');
            break;
        }

        const socialsToInsert: any[] = [];

        // 2. Map talent columns to social profile rows
        for (const talent of talentBatch) {
            lastId = talent.id;

            // --- INSTAGRAM ---
            if (talent.social_instagram || talent.ig_username) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'Instagram',
                    name: talent.ig_full_name,
                    username: talent.ig_username,
                    social_url: talent.social_instagram,
                    social_about: talent.ig_biography,
                    social_image: talent.ig_profile_image,
                    followers_count: parseCount(talent.ig_follower_count),
                    following_count: parseCount(talent.ig_followed_count),
                    media_count: parseCount(talent.ig_media_count),
                    is_verified: talent.ig_verified === true,
                    is_private: talent.ig_private === true
                });
            }

            // --- TIKTOK ---
            if (talent.social_tiktok || talent.tt_username) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'TikTok',
                    username: talent.tt_username,
                    social_id: talent.tt_id,
                    social_url: talent.social_tiktok,
                    social_about: talent.tt_signature,
                    social_image: talent.tt_avatar_larger,
                    followers_count: parseCount(talent.tt_follower_count),
                    following_count: parseCount(talent.tt_following_count),
                    media_count: parseCount(talent.tt_video_count),
                    is_verified: talent.tt_verified === true,
                    is_private: talent.tt_private_account === true
                });
            }

            // --- SPOTIFY ---
            if (talent.spotify_id || talent.social_spotify) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'Spotify',
                    social_id: talent.spotify_id,
                    social_url: talent.social_spotify,
                    social_about: talent.sp_about,
                    social_image: talent.sp_image,
                    followers_count: parseCount(talent.sp_followers),
                    following_count: parseCount(talent.sp_listeners),
                    media_count: parseCount(talent.sp_albums_count),
                    is_verified: talent.sp_verified === true,
                    social_rank: parseRank(talent.sp_rank)
                });
            }

            // --- YOUTUBE ---
            if (talent.yt_id || talent.social_youtube) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'YouTube',
                    name: talent.yt_title,
                    username: talent.yt_handle,
                    social_id: talent.yt_id,
                    social_url: talent.yt_url || talent.social_youtube,
                    social_about: talent.yt_description,
                    social_image: talent.yt_avatar,
                    followers_count: parseCount(talent.yt_subscriber_count),
                    following_count: parseCount(talent.yt_total_views),
                    media_count: parseCount(talent.yt_total_videos),
                    is_verified: talent.yt_is_verified === true || talent.yt_is_verified_artist === true
                });
            }

            // --- IMDB ---
            if (talent.imdb_id || talent.social_imdb) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'IMDb',
                    social_id: talent.imdb_id,
                    social_url: talent.social_imdb,
                    social_about: talent.imdb_about,
                    social_image: talent.imdb_image
                });
            }

            // --- TMDB ---
            if (talent.tmdb_id || talent.Social_tmdb) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'TMDB',
                    social_id: talent.tmdb_id,
                    social_url: talent.Social_tmdb,
                    social_about: talent.tmdb_about,
                    social_image: talent.tmdb_image,
                    social_rank: parseRank(talent.tmdb_popularity)
                });
            }

            // --- DEEZER ---
            if (talent.dz_id || talent.social_deezer) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'Deezer',
                    name: talent.dz_name,
                    social_id: talent.dz_id,
                    social_url: talent.dz_link || talent.social_deezer,
                    social_image: talent.dz_picture_xl,
                    followers_count: parseCount(talent.dz_nb_fan)
                });
            }

            // --- MUSICBRAINZ ---
            if (talent.musicbrainz_id || talent.social_musicbrainz) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'MusicBrainz',
                    social_id: talent.musicbrainz_id,
                    social_url: talent.social_musicbrainz,
                    social_about: talent.mb_disambiguation || talent.mb_bio,
                    social_image: talent.mb_avatar_url,
                    social_rank: parseRank(talent.mb_rating)
                });
            }

            // --- AUDIODB ---
            if (talent.adb_artist_id) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'AudioDB',
                    name: talent.adb_artist,
                    social_id: talent.adb_artist_id,
                    social_about: talent.adb_biography_en,
                    social_image: talent.adb_artist_thumb
                });
            }

            // --- ROVI ---
            if (talent.rovi_id) {
                socialsToInsert.push({
                    talent_id: talent.id,
                    social_type: 'Rovi',
                    social_id: talent.rovi_id,
                    social_about: talent.rovi_headline || talent.rovi_bio,
                    social_image: talent.rovi_image
                });
            }

            // --- SIMPLE URL PLATFORMS ---
            const simplePlatforms = [
                { type: 'Facebook', field: 'social_facebook' },
                { type: 'Twitter', field: 'social_twitter' },
                { type: 'YouTube Music', field: 'social_youtube_music' },
                { type: 'Apple Music', field: 'social_apple_music' },
                { type: 'Bandsintown', field: 'social_bandsintown' },
                { type: 'Shazam', field: 'social_shazam' },
                { type: 'Website', field: 'social_website' },
                { type: 'Amazon Music', field: 'social_amazon_music' },
                { type: 'Chartmetric', field: 'social_chartmetric' },
                { type: 'SoundCloud', field: 'social_soundcloud' },
                { type: 'Wikipedia', field: 'social_wikipedia' },
                { type: 'Wikidata', field: 'social_wikidata' },
                { type: 'Songkick', field: 'social_songkick' },
                { type: 'Pandora', field: 'social_pandora' },
                { type: 'Tidal', field: 'social_tidal' },
                { type: 'iHeartRadio', field: 'social_iheartradio' },
                { type: 'Discogs', field: 'social_discogs' },
                { type: 'Beatport', field: 'social_beatport' },
                { type: 'Audiomack', field: 'social_audiomack' },
                { type: 'Amazon Store', field: 'social_amazon_store' },
                { type: 'Bandcamp', field: 'social_bandcamp' },
                { type: 'IMVDB', field: 'social_imvdb' },
                { type: 'Myspace', field: 'social_myspace' },
                { type: 'Vevo', field: 'social_vevo' },
                { type: 'Genius', field: 'social_genius' },
                { type: 'Setlistfm', field: 'social_setlistfm' },
                { type: 'Musixmatch', field: 'social_musixmatch' },
                { type: 'Qobuz', field: 'social_qobuz' },
                { type: 'Napster', field: 'social_napster' },
                { type: 'AllMusic', field: 'social_allmusic' },
                { type: 'Rostr', field: 'social_rostr' },
                { type: 'IMDbPro', field: 'imdbpro_url' }
            ];

            for (const p of simplePlatforms) {
                if (talent[p.field]) {
                    socialsToInsert.push({
                        talent_id: talent.id,
                        social_type: p.type,
                        social_url: talent[p.field]
                    });
                }
            }
        }

        // 3. Save the new social profile rows in chunks
        if (socialsToInsert.length > 0) {
            console.log(`   ✨ Found ${socialsToInsert.length} social profiles in this batch. Saving...`);
            
            for (let j = 0; j < socialsToInsert.length; j += SAVE_BATCH_SIZE) {
                const miniBatch = socialsToInsert.slice(j, j + SAVE_BATCH_SIZE);
                const { error: saveError } = await supabase
                    .from('social_profiles')
                    .insert(miniBatch);
                
                if (saveError) {
                    console.error(`      ❌ Error saving chunk starting at ${j}:`, saveError.message);
                } else {
                    totalSocialsCreated += miniBatch.length;
                }
            }
        }

        processedCount += talentBatch.length;
        console.log(`📊 Progress: ${processedCount} talent records processed. ${totalSocialsCreated} social rows created.\n`);
    }

    console.log('==========================================');
    console.log('✨ MIGRATION COMPLETE!');
    console.log(`✅ Total Talent Scanned: ${processedCount}`);
    console.log(`✅ Total Socials Mapped: ${totalSocialsCreated}`);
    console.log('==========================================\n');
}

startMigration();
