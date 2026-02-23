// EXACT CODE FROM RAPIDAPI CODE GENERATOR
const http = require('https');

const options = {
	method: 'POST',
	hostname: 'spotify-api25.p.rapidapi.com',
	port: null,
	path: '/getartist',
	headers: {
		'x-rapidapi-key': '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7',
		'x-rapidapi-host': 'spotify-api25.p.rapidapi.com',
		'Content-Type': 'application/json'
	}
};

const req = http.request(options, function (res) {
	const chunks = [];

	res.on('data', function (chunk) {
		chunks.push(chunk);
	});

	res.on('end', function () {
		const body = Buffer.concat(chunks);
		const data = JSON.parse(body.toString());
		
		console.log('Response received!');
		console.log('Top keys:', Object.keys(data));
		console.log('Data keys:', Object.keys(data.data));
		console.log();
		console.log('Has stats?', !!data.data.stats);
		console.log('Has relatedContent?', !!data.data.relatedContent);
		
		if (data.data.stats) {
			console.log('\n✅ STATS FOUND!');
			console.log('Followers:', data.data.stats.followers);
			console.log('Monthly Listeners:', data.data.stats.monthlyListeners);
		}
		
		if (data.data.relatedContent?.relatedArtists) {
			console.log('\n✅ RELATED ARTISTS FOUND!');
			console.log('Total:', data.data.relatedContent.relatedArtists.totalCount);
		}
	});
});

req.write(JSON.stringify({
  id: '1Xyo4u8uXC1ZmMpatF05PJ'
}));
req.end();
