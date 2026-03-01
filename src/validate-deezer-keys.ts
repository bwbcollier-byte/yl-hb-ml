import fetch from 'node-fetch';

const keys = [
    'c83516b3acmshdfd6347a5914a11p17e517jsn06a3c5de8b13',
    '7f039e9cd5msh7d53bf9623df131p1191ccjsnd5baa1efdd82',
    '0be625e0dbmshe3f58bae0a1b103p1a9cb4jsn8f4252e04b42',
    'bfb3e64505mshd9c819df5fb856fp18e4f4jsn98cea7554500',
    '4146451f26mshca24e2bfa13bff4p1aab81jsn84d33f841460',
    '8be5f006c9mshd812675480db254p1b653ejsn602cc9149241',
    '2a6da923bamsh0840070fa506709p145861jsnae8888e67f00',
    '8f8ab324eamsh88b8de70b402e0cp1d7d0ajsn13c934eadbd9',
    '4030dde5ddmshe67eb1d7832914dp17c97ajsndaa5b65ce7d4',
    '730a02e172msh79ca9cab92fe41dp1b34a2jsnd53411309cd7'
];

async function validateKeys() {
    console.log('🔍 Validating RapidAPI Keys for Deezer...');
    const testArtistId = '14294451';
    
    for (const key of keys) {
        process.stdout.write(`Testing key: ${key.substring(0, 10)}... `);
        try {
            const res = await fetch(`https://deezerdevs-deezer.p.rapidapi.com/artist/${testArtistId}`, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                    'x-rapidapi-key': key
                }
            });
            
            const data: any = await res.json();
            
            if (res.ok) {
                if (data.id) {
                    console.log('✅ VALID (Subscribed)');
                } else if (data.message && data.message.includes('not subscribed')) {
                    console.log('❌ NOT SUBSCRIBED');
                } else if (data.error) {
                    console.log(`❌ ERROR: ${JSON.stringify(data.error)}`);
                } else {
                    console.log(`⚠️ UNKNOWN RESPONSE: ${JSON.stringify(data).substring(0, 100)}`);
                }
            } else {
                if (data.message && data.message.includes('You are not subscribed')) {
                    console.log('❌ NOT SUBSCRIBED (403)');
                } else {
                    console.log(`❌ FAILED: ${res.status} ${res.statusText} - ${JSON.stringify(data).substring(0, 50)}`);
                }
            }
        } catch (err: any) {
            console.log(`❌ FETCH ERROR: ${err.message}`);
        }
    }
}

validateKeys();
