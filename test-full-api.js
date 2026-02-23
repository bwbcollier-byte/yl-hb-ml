const fetch = require('node-fetch');

async function testVariousRequests() {
  const artistId = '2AsusXITU8P25dlRNhcAbG'; // Gotye
  const apiKey = 'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13';

  console.log('Testing various API request formats...\n');

  // Test 1: Basic POST (current approach)
  console.log('=== Test 1: Basic POST with just ID ===');
  let response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
    method: 'POST',
    headers: {
      'X-Rapidapi-Key': apiKey,
      'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: artistId })
  });
  let result = await response.json();
  console.log('Data keys:', Object.keys(result.data || {}));
  console.log('Has stats?', !!result.data?.stats);
  console.log('Has relatedContent?', !!result.data?.relatedContent);

  // Test 2: With includeStats parameter
  console.log('\n=== Test 2: With includeStats param ===');
  response = await fetch('https://spotify-api25.p.rapidapi.com/getartist', {
    method: 'POST',
    headers: {
      'X-Rapidapi-Key': apiKey,
      'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      id: artistId,
      includeStats: true,
      includeRelated: true
    })
  });
  result = await response.json();
  console.log('Data keys:', Object.keys(result.data || {}));
  console.log('Has stats?', !!result.data?.stats);
  console.log('Has relatedContent?', !!result.data?.relatedContent);

  // Test 3: Try GET method
  console.log('\n=== Test 3: GET method ===');
  response = await fetch(`https://spotify-api25.p.rapidapi.com/getartist?id=${artistId}`, {
    method: 'GET',
    headers: {
      'X-Rapidapi-Key': apiKey,
      'X-Rapidapi-Host': 'spotify-api25.p.rapidapi.com'
    }
  });
  result = await response.json();
  console.log('Status:', response.status);
  console.log('Data keys:', Object.keys(result.data || {}));
  console.log('Has stats?', !!result.data?.stats);
  console.log('Has relatedContent?', !!result.data?.relatedContent);

  // Test 4: Print full response structure
  console.log('\n=== Test 4: Full response structure (first 1000 chars) ===');
  const responseText = JSON.stringify(result, null, 2);
  console.log(responseText.substring(0, 1000));
}

testVariousRequests().catch(console.error);
