const https = require('https');

// RapidAPI keys  
const RAPIDAPI_KEYS = [
  'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
  '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
  '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
];

async function testArtist(spotifyId) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({ id: spotifyId });
    
    const options = {
      hostname: 'spotify-api25.p.rapidapi.com',
      port: 443,
      path: '/getartist',
      method: 'POST',
      headers: {
        'X-Rapidapi-Key': RAPIDAPI_KEYS[0],
        'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function run() {
  console.log('Testing RapidAPI Spotify endpoint\n');
  
  try {
    const result = await testArtist('06HL4z0CvFAxyc27GXpf94');
    console.log('Response structure:');
    console.log(JSON.stringify(result, null, 2).substring(0, 500) + '...');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
