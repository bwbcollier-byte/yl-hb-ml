const https = require('https');

const apiKey = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';

// Test different request formats
async function testFormat(format, spotifyId) {
  return new Promise((resolve) => {
    let options, body;
    
    if (format === 'post-json') {
      body = JSON.stringify({ id: spotifyId });
      options = {
        hostname: 'spotify-api25.p.rapidapi.com',
        port: 443,
        path: '/getartist',
        method: 'POST',
        headers: {
          'X-Rapidapi-Key': apiKey,
          'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
    } else if (format === 'get-query') {
      options = {
        hostname: 'spotify-api25.p.rapidapi.com',
        port: 443,
        path: `/getartist?id=${spotifyId}`,
        method: 'GET',
        headers: {
          'X-Rapidapi-Key': apiKey,
          'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
        },
      };
    } else {
      // Try alternative endpoint
      body = JSON.stringify({ uri: `spotify:artist:${spotifyId}` });
      options = {
        hostname: 'spotify-api25.p.rapidapi.com',
        port: 443,
        path: '/artist',
        method: 'POST',
        headers: {
          'X-Rapidapi-Key': apiKey,
          'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ format, status: res.statusCode, typename: parsed.data?.artistUnion?.__typename, hasError: parsed.error });
        } catch (e) {
          resolve({ format, status: res.statusCode, error: e.message });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({ format, error: err.message });
    });
    
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('Testing different API formats...\n');
  const spotifyId = '06HL4z0CvFAxyc27GXpf94'; // Taylor Swift
  
  const results = await Promise.all([
    testFormat('post-json', spotifyId),
    testFormat('get-query', spotifyId),
    testFormat('alt-endpoint', spotifyId),
  ]);
  
  results.forEach(r => {
    console.log(`${r.format}:`);
    console.log(`  Status: ${r.status || 'N/A'}`);
    console.log(`  TypeName: ${r.typename || 'N/A'}`);
    console.log(`  Error: ${r.hasError || r.error || 'None'}`);
    console.log();
  });
}

run().catch(console.error);
