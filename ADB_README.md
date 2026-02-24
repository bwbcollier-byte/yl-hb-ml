# TheAudioDB Artist Enrichment

Enriches artist profiles in Airtable with comprehensive data from TheAudioDB API.

## Features

- **Artist Profile Data**: Label, formed/born/died years, genre, style, mood
- **Multi-Language Biographies**: 15 languages (EN, DE, FR, CN, IT, JP, RU, ES, PT, SE, NL, HU, NO, IL, PL)
- **High-Quality Images**: Thumb, logo, cutout, clearart, wide thumb, banner, 4 fanart images
- **Social Links**: Instagram, Spotify, YouTube, SoundCloud, Deezer, iTunes, Discogs, Songkick, Beatport, Tidal
- **Metadata**: MusicBrainz ID, ISNI code, Last.fm chart, charted position

## Airtable Configuration

**Table**: Profiles (HB | Data | Profiles)
- **Base ID**: `appiYGWjEZVB76yyl`
- **Table ID**: `tblQ3DrCHekgRqj7Z`
- **View**: `ADB Process`
- **MusicBrainz ID Field**: `Soc Musicbrainz Id`

### Required Fields (63 total)

**Basic Info (10)**:
- Soc ADB Artist ID
- Soc ADB Artist
- Soc ADB ArtistStripped
- Soc ADB Artist Alternate
- Soc ADB Label
- Soc ADB Label Id
- Soc ADB Formed Year
- Soc ADB Born Year
- Soc ADB Died Year
- Soc ADB Disbanded

**Genre/Style (3)**:
- Soc ADB Style
- Soc ADB Genre
- Soc ADB Mood

**Biographies (15 languages)**:
- Soc ADB BiographyEN
- Soc ADB Biography DE
- Soc ADB Biography FR
- Soc ADB Biography CN
- Soc ADB Biography IT
- Soc ADB Biography JP
- Soc ADB Biography RU
- Soc ADB Biography ES
- Soc ADB Biography PT
- Soc ADB Biography SE
- Soc ADB Biography NL
- Soc ADB Biography HU
- Soc ADB Biography NO
- Soc ADB Biography IL
- Soc ADB Biography PL

**Artist Info (4)**:
- Soc ADB Gender
- Soc ADB Members
- Soc ADB Country
- Soc ADB CountryCode

**Images (11)**:
- Soc ADB Artist Thumb
- Soc ADB Artist Logo
- Soc ADB Artist Cutout
- Soc ADB Artist Clearart
- Soc ADB Artist Wide Thumb
- Soc ADB Artist Fanart
- Soc ADB Artist Fanart2
- Soc ADB Artist Fanart3
- Soc ADB Artist Fanart4
- Soc ADB ArtistBanner

**Social Links (13)**:
- Soc ADB Website
- Soc ADB Facebook
- Soc ADB Twitter
- Soc ADB Instagram
- Soc ADB Spotify
- Soc ADB YouTube
- Soc ADB SoundCloud
- Soc ADB Deezer
- Soc ADB iTunes
- Soc ADB Discogs
- Soc ADB Songkick
- Soc ADB Beatport
- Soc ADB Tidal

**Metadata (5)**:
- Soc ADB Musicbrainz Id
- Soc ADB ISNI code
- Soc ADB LastFMChart
- Soc ADB Charted
- Soc ADB Locked

**Tracking (1)**:
- Soc ADB Check (date field)

## API Integration

### TheAudioDB API
- **Premium API Key**: 925704
- **Artist Endpoint**: `/artist-mb.php?i={musicbrainz_id}`
- **Social Endpoint**: `/artist-social.php?i={artist_id}`
- **Rate Limiting**: 1 request/second (conservative)

### Data Flow
1. Fetch records from "ADB Process" view with MusicBrainz IDs
2. Query TheAudioDB artist endpoint using MusicBrainz ID
3. Query TheAudioDB social endpoint using AudioDB Artist ID
4. Extract and map all fields to Airtable
5. Update record with timestamp in "Soc ADB Check"

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Build TypeScript:
```bash
npm run build
```

## Usage

Run the ADB enrichment:
```bash
npm run adb
```

Test with limited records:
```bash
LIMIT=10 npm run adb
```

## Environment Variables

```env
AIRTABLE_TOKEN=your_airtable_token
AIRTABLE_BASE_ID=appiYGWjEZVB76yyl
AIRTABLE_TABLE_ID=tblQ3DrCHekgRqj7Z
AIRTABLE_VIEW_NAME=ADB Process
AUDIODB_API_KEY=925704
LIMIT=10  # Optional: limit records for testing
```

## Example Output

```
🎵 TheAudioDB Artist Enrichment
================================

Base ID: appiYGWjEZVB76yyl
Table ID: tblQ3DrCHekgRqj7Z
View: ADB Process
API Key: 925704
Limit: 1 records

📥 Fetching records from Airtable...

✅ Found 1 records to process

📋 Processing: Coldplay
   MusicBrainz ID: cc197bad-dc9c-440d-a5b5-d52ba2e14234
   🔍 Fetching TheAudioDB artist data...
   ✅ Found TheAudioDB data
   🔍 Fetching social links...
   ✅ Found 13 social links
   ✅ Prepared update with 58 fields
   💾 Updated successfully

✅ Enrichment complete!
   Processed: 1
   Skipped: 0
```

## Notes

- **MusicBrainz ID Required**: Only artists with a MusicBrainz ID in "Soc Musicbrainz Id" will be enriched
- **Rate Limiting**: 1 second delay between API calls to avoid rate limits
- **Date Tracking**: "Soc ADB Check" field populated with YYYY-MM-DD format
- **Biography Fields**: Long text fields support multiple languages
- **Social Links**: Extracted from separate social endpoint and mapped to individual fields
