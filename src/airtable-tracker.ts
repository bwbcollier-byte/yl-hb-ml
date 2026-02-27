import fetch from 'node-fetch';
import { getSpotifyStats, getMusicBrainzStats, getAudioDBStats, getRoviStats, getMusicFetchStats } from './supabase';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = 'appvOK60xuHCw3Fdz';
const AIRTABLE_TABLE_ID = 'tblL3VDqpRQxWzYCc';

/**
 * Fetch existing record to get current Run Details
 */
async function getExistingRecord(recordId: string) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`⚠️ Failed to fetch Airtable record ${recordId}:`, err);
    return null;
  }

  return response.json();
}

/**
 * Update Airtable record with pipeline status
 */
async function updateAirtable(recordId: string, fields: any) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`⚠️ Failed to update Airtable record ${recordId}:`, err);
  }
}

export async function trackSpotifyStart() {
  const recordId = 'rec7QXzhBs8piBIUd';
  console.log('📝 Tracking Spotify run start in Airtable...');
  
  const stats = await getSpotifyStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const newLog = `[${timestamp}] START:\nNew run starting for Spotify. Records Todo: ${stats.todo}`;
  
  console.log(`📝 Log entry:\n${newLog}`);

  await updateAirtable(recordId, {
    'Run Status': 'Running',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${newLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackSpotifyEnd(processed: number, errors: number) {
  const recordId = 'rec7QXzhBs8piBIUd';
  console.log('✅ Tracking Spotify run completion in Airtable...');
  
  const stats = await getSpotifyStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const completionLog = `[${timestamp}] FINISH:\nProcessed ${processed} records with ${errors} errors for Spotify. ${stats.todo} records still to be processed.`;
  
  await updateAirtable(recordId, {
    'Run Status': 'Complete',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${completionLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackMusicBrainzStart() {
  const recordId = 'recMVWfTjfuqakyIl';
  console.log('📝 Tracking MusicBrainz run start in Airtable...');
  
  const stats = await getMusicBrainzStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const newLog = `[${timestamp}] START:\nNew run starting for MusicBrainz. Records Todo: ${stats.todo}`;
  
  console.log(`📝 Log entry:\n${newLog}`);

  await updateAirtable(recordId, {
    'Run Status': 'Running',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${newLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackMusicBrainzEnd(processed: number, errors: number) {
  const recordId = 'recMVWfTjfuqakyIl';
  console.log('✅ Tracking MusicBrainz run completion in Airtable...');
  
  const stats = await getMusicBrainzStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const completionLog = `[${timestamp}] FINISH:\nProcessed ${processed} records with ${errors} errors for MusicBrainz. ${stats.todo} records still to be processed.`;
  
  await updateAirtable(recordId, {
    'Run Status': 'Complete',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${completionLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackAudioDBStart() {
  const recordId = 'recxapUq9b9H70LaW';
  console.log('📝 Tracking AudioDB run start in Airtable...');
  
  const stats = await getAudioDBStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const newLog = `[${timestamp}] START:\nNew run starting for AudioDB. Records Todo: ${stats.todo}`;
  
  console.log(`📝 Log entry:\n${newLog}`);

  await updateAirtable(recordId, {
    'Run Status': 'Running',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${newLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackAudioDBEnd(processed: number, errors: number) {
  const recordId = 'recxapUq9b9H70LaW';
  console.log('✅ Tracking AudioDB run completion in Airtable...');
  
  const stats = await getAudioDBStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const completionLog = `[${timestamp}] FINISH:\nProcessed ${processed} records with ${errors} errors for AudioDB. ${stats.todo} records still to be processed.`;
  
  await updateAirtable(recordId, {
    'Run Status': 'Complete',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${completionLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackRoviStart() {
  const recordId = 'recvR5qRtVeQFc2UT';
  console.log('📝 Tracking Rovi run start in Airtable...');
  
  const stats = await getRoviStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const newLog = `[${timestamp}] START:\nNew run starting for Rovi. Records Todo: ${stats.todo}`;
  
  console.log(`📝 Log entry:\n${newLog}`);

  await updateAirtable(recordId, {
    'Run Status': 'Running',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${newLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackRoviEnd(processed: number, errors: number) {
  const recordId = 'recvR5qRtVeQFc2UT';
  console.log('✅ Tracking Rovi run completion in Airtable...');
  
  const stats = await getRoviStats();
  const existing = await getExistingRecord(recordId);
  const existingDetails = existing?.fields?.['Run Details'] || '';
  
  const now = new Date();
  const timestamp = now.toLocaleString();
  const completionLog = `[${timestamp}] FINISH:\nProcessed ${processed} records with ${errors} errors for Rovi. ${stats.todo} records still to be processed.`;
  
  await updateAirtable(recordId, {
    'Run Status': 'Complete',
    'Last Run': now.toISOString(),
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Details': `${completionLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackSpotifyProgress() {
  const stats = await getSpotifyStats();
  await updateAirtable('rec7QXzhBs8piBIUd', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total
  });
}

export async function trackMusicBrainzProgress() {
  const stats = await getMusicBrainzStats();
  await updateAirtable('recMVWfTjfuqakyIl', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total
  });
}

export async function trackAudioDBProgress() {
  const stats = await getAudioDBStats();
  await updateAirtable('recxapUq9b9H70LaW', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total
  });
}

export async function trackRoviProgress() {
  const stats = await getRoviStats();
  await updateAirtable('recvR5qRtVeQFc2UT', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total
  });
}

export async function trackMusicFetchStart() {
  const stats = await getMusicFetchStats();
  const startTime = new Date().toISOString();
  const runLog = `Run started at ${startTime}`;

  await updateAirtable('recPH9AiLEKanLZPn', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Status': 'In Progress 🔄',
    'Run Details': runLog
  });
}

export async function trackMusicFetchEnd(processed: number, errors: number) {
  const stats = await getMusicFetchStats();
  const endTime = new Date().toISOString();
  const existingRecord = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/recPH9AiLEKanLZPn`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
  }).then(r => r.json());

  const existingDetails = existingRecord.fields?.['Run Details'] || '';
  const completionLog = `Run completed at ${endTime}\nProcessed: ${processed}\nErrors: ${errors}`;

  await updateAirtable('recPH9AiLEKanLZPn', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total,
    'Run Status': 'Idle ✅',
    'Run Details': `${completionLog}\n\n${existingDetails}`.trim()
  });
}

export async function trackMusicFetchProgress() {
  const stats = await getMusicFetchStats();
  await updateAirtable('recPH9AiLEKanLZPn', {
    'Records Todo': stats.todo,
    'Records Done': stats.done,
    'Records Total': stats.total
  });
}

