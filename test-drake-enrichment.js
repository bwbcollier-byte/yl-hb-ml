const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const RAPIDAPI_KEY = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';
const DRAKE_ID = '3TVXtAsR1Inumichuu2iiC';

const supabase = createClient(
  'https://oerfmtjpwrefxuitsphl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcmZtdGpwd3JlZnh1aXRzcGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjcxODAsImV4cCI6MjA4NjUwMzE4MH0.82Dgq_A9oljS-f7KNYIIGLRqXAA6J6XHZT0BzWBwghQ'
);

function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function testWithDrake() {
  console.log('🎤 Testing complete enrichment with Drake\n');
  
  const options = {
    hostname: 'spotify-api25.p.rapidapi.com',
    port: 443,
    path: '/getartist',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, async (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', async () => {
        try {
          const response = JSON.parse(data);
          const artist = response.data.artistUnion;
          
          console.log('✅ Fetched:', artist.profile.name);

          // Get or create artist profile
          let { data: profileData } = await supabase
            .from('talent_profiles')
            .select('id')
            .eq('spotify_id', DRAKE_ID)
            .single();
          
          if (!profileData) {
            const { data: newProfile } = await supabase
              .from('talent_profiles')
              .insert({ spotify_id: DRAKE_ID, name: artist.profile.name })
              .select()
              .single();
            profileData = newProfile;
          }
          
          const talentProfileId = profileData.id;
          const artistImage = artist.visuals?.avatarImage?.sources?.[0]?.url || '';

          // Process Albums
          const albumGroups = artist.discography?.albums?.items || [];
          const albums = [];
          for (const group of albumGroups) {
            albums.push(...(group.releases?.items || []));
          }
          
          console.log('\n📀 Processing', albums.length, 'albums...');
          let albumCount = 0;
          for (const album of albums.slice(0, 2)) {
            try {
              const { error } = await supabase
                .from('media_profiles')
                .insert({
                  spotify_album_id: album.id,
                  album_name: album.name,
                  spotify_artist_id: DRAKE_ID,
                  spotify_artist_name: artist.profile.name,
                  talent_profile_id: talentProfileId,
                  spotify_type: album.type,
                  release_year: album.date?.year?.toString() || '',
                  label: album.label,
                  cover_art_url: album.coverArt?.sources?.[0]?.url || '',
                });
              
              if (!error) {
                console.log('   ✅', album.name, '-', album.date?.year);
                albumCount++;
              }
            } catch (e) {
              // Already exists
            }
          }
          
          // Process Concerts
          const concerts = artist.goods?.events?.concerts?.items || [];
          console.log('\n🎪 Processing', concerts.length, 'concerts...');
          let concertCount = 0;
          for (const concert of concerts.slice(0, 2)) {
            try {
              const concertArtists = concert.artists?.items || [];
              const { error } = await supabase
                .from('event_profiles')
                .insert({
                  spotify_id: concert.id,
                  talent_profile_id: talentProfileId,
                  title: concert.title,
                  status: 'Todo',
                  image: artistImage,
                  spotify_url: concert.uri,
                  spotify_title: concert.title,
                  spotify_category: concert.category,
                  spotify_festival: concert.festival ? 'Yes' : 'No',
                  spotify_venue_name: concert.venue?.name,
                  spotify_location_name: concert.venue?.location?.name,
                  spotify_latitude: concert.venue?.coordinates?.latitude,
                  spotify_longitude: concert.venue?.coordinates?.longitude,
                  spotify_artist_urls: concertArtists.map((a) => a.uri).join(','),
                  spotify_artist_ids: concertArtists.map((a) => a.id).join(','),
                  spotify_artist_names: concertArtists.map((a) => a.profile?.name).join(','),
                  spotify_date: concert.date?.isoString,
                });
              
              if (!error) {
                console.log('   ✅', concert.title, '@', concert.venue?.name);
                concertCount++;
              }
            } catch (e) {
              // Already exists
            }
          }
          
          // Process Related Artists
          const relatedArtists = artist.relatedContent?.relatedArtists?.items || [];
          console.log('\n👥 Processing', relatedArtists.length, 'related artists...');
          let relatedCount = 0;
          const relatedIds = [];
          const relatedNames = [];
          
          for (const related of relatedArtists.slice(0, 2)) {
            try {
              const avatarUrl = related.visuals?.avatarImage?.sources?.[0]?.url || '';
              const { error } = await supabase
                .from('talent_profiles')
                .insert({
                  spotify_id: related.id,
                  name: related.profile?.name || related.name,
                  sp_type: 'Artist',
                  sp_avatar_image_urls: avatarUrl,
                  sp_image: avatarUrl,
                  sp_data_status: 'Todo',
                  sp_artist_id: related.id,
                });
              
              if (!error) {
                console.log('   ✅', related.profile?.name);
                relatedCount++;
              }
              
              relatedIds.push(related.id);
              relatedNames.push(related.profile?.name || related.name);
            } catch (e) {
              // Already exists
              relatedIds.push(related.id);
              relatedNames.push(related.profile?.name || related.name);
            }
          }
          
          // Update artist with related metadata
          if (relatedIds.length > 0) {
            await supabase
              .from('talent_profiles')
              .update({
                sp_related_artist_ids: relatedIds.join(','),
                sp_related_artist_names: relatedNames.map(n => toTitleCase(n)).join(','),
                sp_data_status: 'Complete',
                sp_check: new Date().toISOString(),
              })
              .eq('spotify_id', DRAKE_ID);
          }
          
          console.log('\n✨ Summary:');
          console.log('   Albums created:', albumCount);
          console.log('   Concerts created:', concertCount);
          console.log('   Related artists processed:', relatedCount);
          
          resolve();
        } catch (err) {
          console.error('Error:', err.message);
          resolve();
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      resolve();
    });
    
    req.write(JSON.stringify({ id: DRAKE_ID }));
    req.end();
  });
}

testWithDrake();
