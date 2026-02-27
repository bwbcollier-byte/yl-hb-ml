const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://oerfmtjpwrefxuitsphl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcmZtdGpwd3JlZnh1aXRzcGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjcxODAsImV4cCI6MjA4NjUwMzE4MH0.82Dgq_A9oljS-f7KNYIIGLRqXAA6J6XHZT0BzWBwghQ'
);

const WEEKND_ID = '1Xyo4u8uXC1ZmMpatF05PJ';

async function verify() {
  console.log('✨ Verifying enriched data fields for The Weeknd\n');
  
  // Get talent profile ID
  const { data: talent } = await supabase
    .from('talent_profiles')
    .select('id, name, sp_related_artist_ids, sp_related_artist_names, sp_data_status, sp_check')
    .eq('spotify_id', WEEKND_ID)
    .single();
  
  console.log('👤 TALENT PROFILE:');
  console.log('   Name:', talent?.name);
  console.log('   Status:', talent?.sp_data_status);
  console.log('   Related Artist IDs:', talent?.sp_related_artist_ids?.split(',').length || 0, 'artists');
  console.log('   Last Updated:', talent?.sp_check?.substring(0, 10));
  
  const talentId = talent?.id;
  
  // Check albums
  const { data: albums } = await supabase
    .from('media_profiles')
    .select('album_name, release_year, spotify_type, label, talent_profile_id, cover_art_url')
    .eq('spotify_artist_id', WEEKND_ID)
    .limit(3);
  
  console.log('\n📀 ALBUMS (first 3):');
  if (albums && albums.length > 0) {
    albums.forEach((a, i) => {
      console.log(`   [${i+1}] ${a.album_name} (${a.release_year})`);
      console.log(`       Type: ${a.spotify_type}`);
      console.log(`       Label: ${a.label}`);
      console.log(`       Linked to artist: ${a.talent_profile_id ? '✅' : '❌'}`);
      console.log(`       Cover art: ${a.cover_art_url ? '✅' : '❌'}`);
    });
  }
  
  // Check concerts
  const { data: concerts } = await supabase
    .from('event_profiles')
    .select('title, spotify_venue_name, spotify_location_name, spotify_category, spotify_festival, talent_profile_id, spotify_artist_urls, spotify_date')
    .eq('spotify_artist_ids', WEEKND_ID)
    .limit(3);
  
  console.log('\n🎪 CONCERTS (first 3):');
  if (concerts && concerts.length > 0) {
    concerts.forEach((c, i) => {
      console.log(`   [${i+1}] ${c.title}`);
      console.log(`       Venue: ${c.spotify_venue_name}, ${c.spotify_location_name}`);
      console.log(`       Category: ${c.spotify_category} | Festival: ${c.spotify_festival}`);
      console.log(`       Date: ${c.spotify_date}`);
      console.log(`       Linked to artist: ${c.talent_profile_id ? '✅' : '❌'}`);
      console.log(`       Artists: ${c.spotify_artist_urls?.split(',').length || 0} artists`);
    });
  }
  
  // Check related artists
  const { data: relatedArtists } = await supabase
    .from('talent_profiles')
    .select('name, sp_type, sp_data_status, sp_image, sp_artist_id')
    .eq('sp_type', 'Artist')
    .limit(3);
  
  console.log('\n👥 RELATED ARTISTS (first 3):');
  if (relatedArtists && relatedArtists.length > 0) {
    relatedArtists.forEach((a, i) => {
      console.log(`   [${i+1}] ${a.name}`);
      console.log(`       Type: ${a.sp_type}`);
      console.log(`       Status: ${a.sp_data_status}`);
      console.log(`       Avatar: ${a.sp_image ? '✅' : '❌'}`);
    });
  }
  
  console.log('\n✅ Data verification complete!\n');
}

verify().catch(console.error);
