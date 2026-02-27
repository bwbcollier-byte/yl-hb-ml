const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://oerfmtjpwrefxuitsphl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcmZtdGpwd3JlZnh1aXRzcGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjcxODAsImV4cCI6MjA4NjUwMzE4MH0.82Dgq_A9oljS-f7KNYIIGLRqXAA6J6XHZT0BzWBwghQ'
);

async function verify() {
  console.log('📊 Verifying Weeknd enrichment in Supabase...\n');
  
  const WEEKND_ID = '1Xyo4u8uXC1ZmMpatF05PJ';
  
  // Check albums
  const { data: albums, error: albumErr } = await supabase
    .from('media_profiles')
    .select('album_name, release_year')
    .eq('spotify_artist_id', WEEKND_ID)
    .limit(5);
  
  console.log('📀 Albums for The Weeknd:');
  if (albumErr) {
    console.log('   ❌ Error:', albumErr.message);
  } else {
    console.log(`   Total: ${albums.length}`);
    albums.forEach(a => console.log(`   ✅ ${a.album_name} (${a.release_year})`));
  }
  
  // Check concerts
  const { data: concerts, error: concertErr } = await supabase
    .from('event_profiles')
    .select('title, spotify_venue_name, spotify_location_name')
    .eq('spotify_artist_ids', WEEKND_ID)
    .limit(5);
  
  console.log('\n🎪 Concerts for The Weeknd:');
  if (concertErr) {
    console.log('   ❌ Error:', concertErr.message);
  } else {
    console.log(`   Total: ${concerts.length}`);
    concerts.forEach(c => console.log(`   ✅ ${c.title} @ ${c.spotify_venue_name}, ${c.spotify_location_name}`));
  }
  
  console.log('\n✅ Verification complete!');
}

verify();
