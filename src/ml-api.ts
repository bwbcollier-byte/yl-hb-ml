import fetch from 'node-fetch';

/**
 * Musiclinkss API client with multi-key rotation for RapidAPI.
 * Supports up to 10 API keys.
 */

const RAPIDAPI_HOST = 'musiclinkssapi.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

// Load available keys
const RAPID_API_KEYS: string[] = [];
for (let i = 1; i <= 10; i++) {
    const key = process.env[`RAPIDAPI_KEY_${i}`];
    if (key && !key.includes('your-')) {
        RAPID_API_KEYS.push(key);
    }
}

if (RAPID_API_KEYS.length === 0) {
    console.error('❌ No RAPIDAPI_KEY_* found. Please set at least RAPIDAPI_KEY_1.');
    process.exit(1);
}

let currentKeyIndex = 0;
let totalApiCalls = 0;
let failedApiCalls = 0;

function getNextKey(): string {
    const key = RAPID_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % RAPID_API_KEYS.length;
    return key;
}

export function getApiStats() {
    return {
        totalKeys: RAPID_API_KEYS.length,
        totalApiCalls,
        failedApiCalls,
        successRate: totalApiCalls > 0 
            ? Math.round(((totalApiCalls - failedApiCalls) / totalApiCalls) * 100) 
            : 0
    };
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface MusicLinksResponse {
    id: string;
    title: string;
    description?: string;
    image?: string;
    links: {
        Spotify?: string;
        Deezer?: string;
        Tidal?: string;
        Amazon?: string;
        Qobuz?: string;
        Napster?: string;
        Apple?: string;
        Bandcamp?: string;
        Audius?: string;
        Audiomack?: string;
        Youtube?: string;
        Soundcloud?: string;
    };
    error?: string;
}

/**
 * Fetch data from Musiclinkss API by Spotify URL.
 * Works for both Artists and Albums.
 */
let consecutiveErrors = 0;

export async function fetchMusicLinks(spotifyUrl: string): Promise<MusicLinksResponse | null> {
    if (consecutiveErrors >= 5) {
        console.error('   🚨 Circuit breaker triggered: API is failing consistently (likely provider rate-limiting). Exiting early to prevent wasting credits/looping.');
        process.exit(1);
    }
    const key = getNextKey();
    totalApiCalls++;
    try {
        const encodedUrl = encodeURIComponent(spotifyUrl);
        const response = await fetch(`${BASE_URL}/search/url?spotify_url=${encodedUrl}`, {
            method: 'GET',
            headers: {
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': key
            }
        });

        if (!response.ok) {
            failedApiCalls++;
            consecutiveErrors++;
            
            // Check if Axios error from the RapidAPI provider side
            try {
                const errData = await response.json();
                console.error(`   ❌ API Error for ${spotifyUrl}: ${response.status} - ${JSON.stringify(errData)}`);
            } catch {
                console.error(`   ❌ API Error for ${spotifyUrl}: ${response.status}`);
            }
            return null;
        }

        const data = await response.json() as MusicLinksResponse;
        if (data.error) {
            failedApiCalls++;
            consecutiveErrors++;
            console.error(`   ⚠️ API Response Error: ${data.error}`);
            return null;
        }
        
        consecutiveErrors = 0; // Reset on success
        return data;
    } catch (err: any) {
        failedApiCalls++;
        consecutiveErrors++;
        console.error(`   ❌ Network error:`, err.message);
        return null;
    }
}
