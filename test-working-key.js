// Test with the exact API key that works in curl
const fetch = require('node-fetch');

const artistId = '1Xyo4u8uXC1ZmMpatF05PJ'; // The Weeknd
const apiKey = '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7'; // The working key from curl

async function test() {
  console.log('Testing with the working API key from curl...\n');

  const response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-key': apiKey, // lowercase to match curl
      'x-rapidapi-host': 'spotify-api25.p.rapidapi.com', // lowercase to match curl
      'User-Agent': 'node-fetch'
    },
    body: JSON.stringify({ id: artistId })
  });

  const result = await response.json();

  console.log(`Status: ${response.status}`);
  console.log(`Top keys: [${Object.keys(result).join(', ')}]`);
  
  if (result.data) {
    console.log(`Data keys: [${Object.keys(result.data).join(', ')}]`);
    console.log(`\n Has stats? ${!!result.data.stats}`);
    console.log(`Has relatedContent? ${!!result.data.relatedContent}`);
    
    if (result.data.stats) {
      console.log(`\n✅ Stats found!`);
      console.log(`  Followers: ${result.data.stats.followers?.toLocaleString()}`);
      console.log(`  Monthly Listeners: ${result.data.stats.monthlyListeners?.toLocaleString()}`);
      console.log(`  World Rank: ${result.data.stats.worldRank}`);
    }
    
    if (result.data.relatedContent?.relatedArtists) {
      console.log(`\n✅ Related Artists found!`);
      console.log(`  Total Count: ${result.data.relatedContent.relatedArtists.totalCount}`);
      console.log(`  Items: ${result.data.relatedContent.relatedArtists.items?.length || 0}`);
    }
  }
}

test().catch(console.error);
