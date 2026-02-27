const https = require('https');

const RAPIDAPI_KEY = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';
const DRAKE_ID = '3TVXtAsR1Inumichuu2iiC';

const options = {
  hostname: 'spotify-api25.p.rapidapi.com',
  port: 443,
  path: '/getartist',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      const artist = response.data?.artistUnion;
      
      if (!artist) {
        console.log('No artist data in response');
        console.log('Response keys:', Object.keys(response));
        console.log('Data keys:', response.data ? Object.keys(response.data) : 'no data');
        return;
      }
      
      console.log('✅ Artist:', artist.profile?.name);
      console.log('📀 Albums:', artist.discography?.albums?.items?.length || 0);
      console.log('🎪 Concerts:', artist.goods?.events?.concerts?.items?.length || 0);
      console.log('👥 Related:', artist.relatedContent?.relatedArtists?.items?.length || 0);
    } catch (err) {
      console.error('Parse error:', err.message);
      console.log('Raw response length:', data.length);
    }
  });
});

req.on('error', console.error);
req.write(JSON.stringify({ id: DRAKE_ID }));
req.end();
