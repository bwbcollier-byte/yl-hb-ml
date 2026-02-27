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
      
      const albums = artist.discography?.albums?.items || [];
      console.log('📀 Albums:', albums.length);
      albums.slice(0, 3).forEach(a => console.log('   -', a.name, '(' + a.date.year + ')'));
      console.log('');
      
      const concerts = artist.goods?.events?.concerts?.items || [];
      console.log('🎪 Concerts:', concerts.length);
      concerts.slice(0, 3).forEach(c => console.log('   -', c.title, '@', c.venue.name));
      console.log('');
      
      const related = artist.relatedContent?.relatedArtists?.items || [];
      console.log('👥 Related Artists:', related.length);
      related.slice(0, 3).forEach(r => console.log('   -', r.profile.name));
    } catch (err) {
      console.error('Error parsing response:', err.message);
      console.log('Response:', data.substring(0, 200));
    }
  });
});

req.on('error', console.error);
req.write(JSON.stringify({ id: WEEKND_ID }));
req.end();
