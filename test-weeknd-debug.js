const https = require('https');

const RAPIDAPI_KEY = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';
const WEEKND_ID = '1Xyo4u8uXC1ZmMpatF05PJ';

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
      const artist = response.data.artistUnion;
      
      console.log('✅ Artist:', artist.profile.name);
      console.log('');
      
      // Check albums structure
      const albums = artist.discography?.albums?.items || [];
      console.log('📀 Albums structure check:');
      if (albums.length > 0) {
        console.log('   First album keys:', Object.keys(albums[0]).slice(0, 5).join(', '));
        console.log('   Sample album:', {
          name: albums[0].name,
          date: albums[0].date,
        });
      }
      console.log('   Total albums:', albums.length);
      console.log('');
      
      // Check concerts structure
      const concerts = artist.goods?.events?.concerts?.items || [];
      console.log('🎪 Concerts structure check:');
      if (concerts.length > 0) {
        console.log('   First concert keys:', Object.keys(concerts[0]).slice(0, 5).join(', '));
        console.log('   Sample concert:', {
          title: concerts[0].title,
          venue: concerts[0].venue?.name,
          date: concerts[0].date,
        });
      }
      console.log('   Total concerts:', concerts.length);
      
    } catch (err) {
      console.error('Error:', err.message);
      console.log('Response sample:', data.substring(0, 500));
    }
  });
});

req.on('error', console.error);
req.write(JSON.stringify({ id: WEEKND_ID }));
req.end();
