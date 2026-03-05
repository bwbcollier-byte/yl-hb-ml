import { 
  getSpotifyStats, 
  getMusicBrainzStats, 
  getAudioDBStats, 
  getRoviStats, 
  getMusicFetchStats 
} from './src/supabase';
import dotenv from 'dotenv';

dotenv.config();

async function runCheck() {
  console.log('🚀 === COMPREHENSIVE PIPELINE CHECK === 🚀\n');

  console.log('--- Spotify Enrichment ---');
  const spStats = await getSpotifyStats();
  console.log(`Todo:  ${spStats.todo.toLocaleString()}`);
  console.log(`Done:  ${spStats.done.toLocaleString()}`);
  console.log(`Total: ${spStats.total.toLocaleString()}`);
  console.log(`Progress: ${((spStats.done / spStats.total) * 100).toFixed(2)}%\n`);

  console.log('--- MusicBrainz Enrichment ---');
  const mbStats = await getMusicBrainzStats();
  console.log(`Todo:  ${mbStats.todo.toLocaleString()}`);
  console.log(`Done:  ${mbStats.done.toLocaleString()}`);
  console.log(`Total: ${mbStats.total.toLocaleString()}`);
  console.log(`Progress: ${((mbStats.done / mbStats.total) * 100).toFixed(2)}%\n`);

  console.log('--- AudioDB Enrichment ---');
  const adbStats = await getAudioDBStats();
  console.log(`Todo:  ${adbStats.todo.toLocaleString()}`);
  console.log(`Done:  ${adbStats.done.toLocaleString()}`);
  console.log(`Total: ${adbStats.total.toLocaleString()}`);
  console.log(`Progress: ${((adbStats.done / adbStats.total) * 100).toFixed(2)}%\n`);

  console.log('--- Rovi Enrichment ---');
  const roviStats = await getRoviStats();
  console.log(`Todo:  ${roviStats.todo.toLocaleString()}`);
  console.log(`Done:  ${roviStats.done.toLocaleString()}`);
  console.log(`Total: ${roviStats.total.toLocaleString()}`);
  console.log(`Progress: ${((roviStats.done / roviStats.total) * 100).toFixed(2)}%\n`);

  console.log('--- MusicFetch Enrichment ---');
  const mfStats = await getMusicFetchStats();
  console.log(`Todo:  ${mfStats.todo.toLocaleString()}`);
  console.log(`Done:  ${mfStats.done.toLocaleString()}`);
  console.log(`Total: ${mfStats.total.toLocaleString()}`);
  console.log(`Progress: ${((mfStats.done / mfStats.total) * 100).toFixed(2)}%`);
}

runCheck().catch(console.error);
