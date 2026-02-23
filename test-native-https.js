// Test with native HTTPS module instead of node-fetch
const https = require('https');

const artistId = '1Xyo4u8uXC1ZmMpatF05PJ'; // The Weeknd
const apiKey = '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7';

const postData = JSON.stringify({ id: artistId });

const options = {
  hostname: 'spotify-api25.p.rapidapi.com',
  path: '/getartist',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
    'x-rapidapi-key': apiKey
  }
};

console.log('Testing with native HTTPS module...\n');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      
      console.log(`Top keys: [${Object.keys(result).join(', ')}]`);
      
      if (result.data) {
        console.log(`Data keys: [${Object.keys(result.data).join(', ')}]`);
        console.log(`\nHas stats? ${!!result.data.stats}`);
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
          if (result.data.relatedContent.relatedArtists.items?.length > 0) {
            console.log(`  First 3: ${result.data.relatedContent.relatedArtists.items.slice(0, 3).map(a => a.profile.name).join(', ')}`);
          }
        }
      }
    } catch (error) {
      console.error('Parse error:', error.message);
      console.log('Raw data (first 1000 chars):', data.substring(0, 1000));
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(postData);
req.end();
