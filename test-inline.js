const https = require('https');

const artistId = '1Xyo4u8uXC1ZmMpatF05PJ'; // The Weeknd
const requestBody = JSON.stringify({ id: artistId });

const options = {
  hostname: 'spotify-api25.p.rapidapi.com',
  port: 443,
  path: '/getartist',
  method: 'POST',
  headers: {
    'X-Rapidapi-Key': '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7',
    'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
    'Content-Type': 'application/json',
    'Content-Length': requestBody.length
  }
};

console.log('Testing from spotify-artist-enrichment folder...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Response keys:', Object.keys(json));
      if (json.data) {
        console.log('data keys:', Object.keys(json.data));
        console.log('\nHas stats?', !!json.data.stats);
        console.log('Has relatedContent?', !!json.data.relatedContent);
        
        if (json.data.stats) {
          console.log('\n✅ STATS FOUND:');
          console.log(JSON.stringify(json.data.stats, null, 2));
        }
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(requestBody);
req.end();
