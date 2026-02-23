// Test with headers that Postman typically sends
const fetch = require('node-fetch');

const artistId = '1Xyo4u8uXC1ZmMpatF05PJ'; // The Weeknd
const apiKey = '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7';

async function test() {
  console.log('Testing with Postman-like headers...\n');

  const response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
      'useQueryString': 'true' // RapidAPI specific header
    },
    body: JSON.stringify({ id: artistId })
  });

  const result = await response.json();

  console.log(`Status: ${response.status}`);
  console.log(`Top keys: [${Object.keys(result).join(', ')}]`);
  
  if (result.data) {
    console.log(`Data keys: [${Object.keys(result.data).join(', ')}]`);
    console.log(`\nHas stats? ${!!result.data.stats}`);
    console.log(`Has relatedContent? ${!!result.data.relatedContent}`);
    
    if (result.data.stats) {
      console.log(`\n✅ SUCCESS! Stats found!`);
      console.log(`  Followers: ${result.data.stats.followers?.toLocaleString()}`);
      console.log(`  Monthly Listeners: ${result.data.stats.monthlyListeners?.toLocaleString()}`);
      console.log(`  World Rank: ${result.data.stats.worldRank}`);
    }
    
    if (result.data.relatedContent?.relatedArtists) {
      console.log(`\n✅ SUCCESS! Related Artists found!`);
      console.log(`  Total Count: ${result.data.relatedContent.relatedArtists.totalCount}`);
      console.log(`  Items: ${result.data.relatedContent.relatedArtists.items?.length || 0}`);
      if (result.data.relatedContent.relatedArtists.items?.length > 0) {
        console.log(`  First 5: ${result.data.relatedContent.relatedArtists.items.slice(0, 5).map(a => a.profile.name).join(', ')}`);
      }
    }
  }
}

test().catch(console.error);
