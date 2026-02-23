const fetch = require('node-fetch');

const apiKey = '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7';
const artistId = '1Xyo4u8uXC1ZmMpatF05PJ'; // The Weeknd

async function testExactHeaders() {
  console.log('Testing with EXACT header capitalization from user\'s working request...\n');
  
  try {
    const response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
      method: 'POST',
      headers: {
        'X-Rapidapi-Key': apiKey,           // Capitalized X, R, K
        'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',  // Capitalized X, R, H
        'Content-Type': 'application/json',
        'Host': 'spotify-api25.p.rapidapi.com',
      },
      body: JSON.stringify({ id: artistId })
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log();

    const data = await response.json();
    
    console.log('Top-level keys:', Object.keys(data));
    if (data.data) {
      console.log('Data keys:', Object.keys(data.data));
      console.log();
      
      // Check for stats
      if (data.data.stats) {
        console.log('✅ HAS STATS!');
        console.log('Followers:', data.data.stats.followers);
        console.log('Monthly Listeners:', data.data.stats.monthlyListeners);
        console.log('World Rank:', data.data.stats.worldRank);
      } else {
        console.log('❌ NO stats');
      }
      console.log();
      
      // Check for relatedContent
      if (data.data.relatedContent?.relatedArtists) {
        console.log('✅ HAS RELATED ARTISTS!');
        console.log('Total Count:', data.data.relatedContent.relatedArtists.totalCount);
        console.log('First 5 artists:');
        data.data.relatedContent.relatedArtists.items.slice(0, 5).forEach(artist => {
          console.log(`  - ${artist.profile.name}`);
        });
      } else {
        console.log('❌ NO relatedContent');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExactHeaders();
