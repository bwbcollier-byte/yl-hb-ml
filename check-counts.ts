import dotenv from 'dotenv';
import { 
  getArtistsForMusicBrainzEnrichment, 
  getArtistsForAudioDBEnrichment, 
  getArtistsForRoviEnrichment,
  getArtistsForMusicFetchEnrichment,
  getPendingArtists
} from './src/supabase';

dotenv.config();

async function check() {
  console.log('--- Pipeline Eligibility Check ---');
  
  const spotify = await getPendingArtists(1);
  console.log(`Spotify Todo:      ${spotify.length > 0 ? 'Lots (Showing 1+)' : '0'}`);

  const mb = await getArtistsForMusicBrainzEnrichment(10001);
  console.log(`MusicBrainz Todo:  ${mb.length}`);

  const adb = await getArtistsForAudioDBEnrichment(10001);
  console.log(`AudioDB Todo:      ${adb.length}`);

  const rovi = await getArtistsForRoviEnrichment(10001);
  console.log(`Rovi Todo:         ${rovi.length}`);

  const mf = await getArtistsForMusicFetchEnrichment(10001);
  console.log(`MusicFetch Todo:   ${mf.length}`);
}

check();
