const https = require('https');

// Test RapidAPI Spotify endpoint directly
const RAPIDAPI_KEYS = [
  process.env.RAPIDAPI_KEY_1,
  process.env.RAPIDAPI_KEY_2,
  process.env.RAPIDAPI_KEY_3,
  process.env.RAPIDAPI_KEY_4,
  process.env.RAPIDAPI_KEY_5,
  process.env.RAPIDAPI_KEY_6,
  process.env.RAPIDAPI_KEY_7,
  process.env.RAPIDAPI_KEY_8,
  process.env.RAPIDAPI_KEY_9,
  process.env.RAPIDAPI_KEY_10,
  process.env.RAPIDAPI_KEY_11,
].filter(Boolean);

console.log(`✅ Loaded ${RAPIDAPI_KEYS.length} RapidAPI keys\n`);

// Test artists
const testArtists = [
  { spotify_id: '06HL4z0CvFAxyc27GXpf94', name: 'Taylor Swift' },
  { spotify_id: '5XeFesPbtLpXzIVDNQP79', name: 'The Weeknd' },
  { spotify_id: '4Z8W4fKeB0K0MH03ebuORQ', name: 'Ariana Grande' },
];

async function fetchSpotifyArtist(artistId, keyIndex = 0) {
  return new Promise((resolve, reject) => {
    const key = RAPIDAPI_KEYS[keyIndex % RAPIDAPI_KEYS.length];
    if (!key) {
      reject(new Error('No API keys available'));
      return;
    }

    const options = {
      hostname: 'spotify-api25.p.rapidapi.com',
      port: 443,
      path: `/tracks/?ids=${artistId}`,
      method: 'GET',
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testArtist(artist, index) {
  console.log(`🎵 [${index + 1}] Testing: ${artist.name} (${artist.spotify_id})`);
  try {
    const result = await fetchSpotifyArtist(artist.spotify_id, index);
    console.log(`   ✅ Success: ${JSON.stringify(result).substring(0, 100)}...`);
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
}

async function runTests() {
  console.log('🚀 Testing RapidAPI Spotify endpoint\n');
  for (let i = 0; i < testArtists.length; i++) {
    await testArtist(testArtists[i], i);
    await new Promise(r => setTimeout(r, 1000)); // 1 second delay between requests
  }
  console.log('\n✅ Tests complete');
}

runTests();
