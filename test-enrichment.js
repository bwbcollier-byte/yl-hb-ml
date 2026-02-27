const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const RAPIDAPI_KEY = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';
const WEEKND_ID = '1Xyo4u8uXC1ZmMpatF05PJ';

const supabase = createClient(
  'https://oerfmtjpwrefxuitsphl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcmZtdGpwd3JlZnh1aXRzcGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjcxODAsImV4cCI6MjA4NjUwMzE4MH0.82Dgq_A9oljS-f7KNYIIGLRqXAA6J6XHZT0BzWBwghQ'
);

async function testEnrichment() {
  console.log('🎵 Testing Weeknd enrichment...\n');
  
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
          
          console.log('✅ Artist:', artist.profile.name);

          // Process albums
          const albumGroups = artist.discography?.albums?.items || [];
          const albums = [];
          for (const group of albumGroups) {
            const releases = group.releases?.items || [];
            albums.push(...releases);
          }
          
          console.log('\n📀 Albums:', albums.length);
          let albumsCreated = 0;
          for (const album of albums.slice(0, 3)) {
            try {
              const { data: existing } = await supabase
                .from('media_profiles')
                .select('id')
                .eq('spotify_album_id', album.id)
                .maybeSingle();

              if (!existing) {
                const { error } = await supabase
                  .from('media_profiles')
                  .insert({
                    spotify_album_id: album.id,
                    album_name: album.name,
                    spotify_artist_id: WEEKND_ID,
                    spotify_artist_name: 'The Weeknd',
                    release_year: album.date?.year?.toString() || '',
                  });
                
                if (error) {
                  console.log(`   ❌ Album "${album.name}": ${error.message}`);
                } else {
                  console.log(`   ✅ Album: ${album.name}`);
                  albumsCreated++;
                }
              }
            } catch (err) {
              console.log(`   ⚠️  Error: ${err.message}`);
            }
          }
          
          // Process concerts
          const concerts = artist.goods?.events?.concerts?.items || [];
          console.log('\n🎪 Concerts:', concerts.length);
          let concertsCreated = 0;
          for (const concert of concerts.slice(0, 3)) {
            try {
              const { data: existing } = await supabase
                .from('event_profiles')
                .select('id')
                .eq('spotify_id', concert.id)
                .maybeSingle();

              if (!existing) {
                const { error } = await supabase
                  .from('event_profiles')
                  .insert({
                    spotify_id: concert.id,
                    title: concert.title,
                    spotify_venue_name: concert.venue?.name,
                    spotify_location_name: concert.venue?.location?.name,
                    spotify_latitude: concert.venue?.coordinates?.latitude,
                    spotify_longitude: concert.venue?.coordinates?.longitude,
                    spotify_date: concert.date?.isoString,
                    spotify_artist_names: 'The Weeknd',
                    spotify_artist_ids: WEEKND_ID,
                  });
                
                if (error) {
                  console.log(`   ❌ Concert "${concert.title}": ${error.message}`);
                } else {
                  console.log(`   ✅ Concert: ${concert.title} @ ${concert.venue?.name}`);
                  concertsCreated++;
                }
              }
            } catch (err) {
              console.log(`   ⚠️  Error: ${err.message}`);
            }
          }
          
          console.log('\n✅ Test complete!');
          console.log(`   Albums processed: ${albumsCreated}`);
          console.log(`   Concerts processed: ${concertsCreated}`);
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
    
    req.write(JSON.stringify({ id: WEEKND_ID }));
    req.end();
  });
}

testEnrichment();
