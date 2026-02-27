const https = require('https');

const RAPIDAPI_KEYS = [
  'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
  '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
  '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
  'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
  '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460',
  '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241',
  '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00',
  'cea3641b50msh52581f483562ccdp186ee6jsn6759e8241393',
  '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9',
  '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4',
  '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7',
];

async function testKey(key, keyIndex) {
  return new Promise((resolve) => {
    const spotifyId = '3TVXtAsR1Inumichuu2iiC'; // Drake - common test ID
    const requestBody = JSON.stringify({ id: spotifyId });
    
    const options = {
      hostname: 'spotify-api25.p.rapidapi.com',
      port: 443,
      path: '/getartist',
      method: 'POST',
      headers: {
        'X-Rapidapi-Key': key,
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
          const typename = parsed.data?.artistUnion?.__typename;
          const hasStats = !!parsed.data?.artistUnion?.stats;
          const hasProfile = !!parsed.data?.artistUnion?.profile;
          
          // Also check response headers for rate limit info
          const remaining = res.headers['x-ratelimit-requests-remaining'];
          const limit = res.headers['x-ratelimit-requests-limit'];
          
          resolve({
            index: keyIndex + 1,
            key: key.substring(0, 8) + '...',
            status: res.statusCode,
            typename,
            hasStats,
            hasProfile,
            remaining,
            limit,
          });
        } catch (e) {
          resolve({
            index: keyIndex + 1,
            key: key.substring(0, 8) + '...',
            status: res.statusCode,
            error: 'Parse error',
          });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({
        index: keyIndex + 1,
        key: key.substring(0, 8) + '...',
        error: err.message,
      });
    });
    
    req.write(requestBody);
    req.end();
  });
}

async function run() {
  console.log('Testing all RapidAPI keys for quota/validity...\n');
  console.log('Key    | Status | TypeName | Stats | Profile | Remaining/Limit');
  console.log('-------|--------|----------|-------|---------|----------------');
  
  const results = await Promise.all(RAPIDAPI_KEYS.map((key, i) => testKey(key, i)));
  
  results.forEach(r => {
    const status = r.error ? '❌ ERR' : `✅ ${r.status}`;
    const typename = r.typename || 'N/A';
    const stats = r.hasStats ? '✅' : '❌';
    const profile = r.hasProfile ? '✅' : '❌';
    const remaining = r.remaining ? `${r.remaining}/${r.limit}` : 'N/A';
    
    console.log(`${r.index.toString().padEnd(6)} | ${status.padEnd(6)} | ${typename.padEnd(8)} | ${stats.padEnd(5)} | ${profile.padEnd(7)} | ${remaining}`);
  });
}

run().catch(console.error);
