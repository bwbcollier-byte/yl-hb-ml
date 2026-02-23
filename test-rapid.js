const fetch = require('node-fetch');

async function testAPI() {
  const response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
    method: 'POST',
    headers: {
      'X-Rapidapi-Key': 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
      'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: '1Xyo4u8uXC1ZmMpatF05PJ' })
  });

  const result = await response.json();
  console.log('Top keys:', Object.keys(result));
  console.log('Data keys:', Object.keys(result.data || {}));
  console.log('Stats:', result.data?.stats);
  console.log('Related:', result.data?.relatedContent?.relatedArtists?.totalCount);
}

testAPI();
