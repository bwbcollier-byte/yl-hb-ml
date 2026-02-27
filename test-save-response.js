const https = require('https');
const fs = require('fs');

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
      
      // Save the full response
      fs.writeFileSync('weeknd-response.json', JSON.stringify(response, null, 2));
      
      const artist = response.data.artistUnion;
      
      console.log('✅ Saved weeknd-response.json');
      console.log('Artist:', artist.profile.name);
      
      // Show the albums path
      console.log('\n📀 Albums path breakdown:');
      console.log('- discography exists?', !!artist.discography);
      if (artist.discography) {
        console.log('  - discography.albums exists?', !!artist.discography.albums);
        if (artist.discography.albums) {
          console.log('    - albums.items exists?', !!artist.discography.albums.items);
          console.log('    - items length:', artist.discography.albums.items?.length || 0);
          if (artist.discography.albums.items && artist.discography.albums.items.length > 0) {
            console.log('    - First item keys:', Object.keys(artist.discography.albums.items[0]));
            console.log('    - First item name:', artist.discography.albums.items[0].name);
          }
        }
      }
      
      // Show the concerts path
      console.log('\n🎪 Concerts path breakdown:');
      console.log('- goods exists?', !!artist.goods);
      if (artist.goods) {
        console.log('  - goods.events exists?', !!artist.goods.events);
        if (artist.goods.events) {
          console.log('    - events.concerts exists?', !!artist.goods.events.concerts);
          if (artist.goods.events.concerts) {
            console.log('    - concerts.items length:', artist.goods.events.concerts.items?.length || 0);
          }
        }
      }
      
    } catch (err) {
      console.error('Error:', err.message);
    }
  });
});

req.on('error', console.error);
req.write(JSON.stringify({ id: WEEKND_ID }));
req.end();
