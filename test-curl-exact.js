const https = require('https');

const apiKey = '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42';
const spotifyId = '1Xyo4u8uXC1ZmMpatF05PJ'; // Your test ID

const requestBody = JSON.stringify({ id: spotifyId });

const options = {
  hostname: 'spotify-api25.p.rapidapi.com',
  port: 443,
  path: '/getartist',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
    'x-rapidapi-key': apiKey,
    'Content-Length': Buffer.byteLength(requestBody),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('✅ Response received');
      console.log('Status:', res.statusCode);
      console.log('TypeName:', parsed.data?.artistUnion?.__typename);
      console.log('Has stats:', !!parsed.data?.artistUnion?.stats);
      console.log('Has profile:', !!parsed.data?.artistUnion?.profile?.name);
      console.log('\nFull response (first 500 chars):');
      console.log(JSON.stringify(parsed, null, 2).substring(0, 500));
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
});

req.on('error', err => {
  console.error('Request error:', err.message);
});

console.log(`Testing ID: ${spotifyId}\n`);
req.write(requestBody);
req.end();
