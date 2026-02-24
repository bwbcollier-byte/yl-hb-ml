# MusicBrainz & TheAudioDB Full Enrichment

Enriches artist profiles AND albums in Airtable with comprehensive data from MusicBrainz and TheAudioDB APIs.

## Features

### Artist Enrichment

#### MusicBrainz Data
- Artist type (person, group, orchestra, etc.)
- Gender, country, area
- Formation/birth date
- Life span (begin/end dates and areas)
- Disambiguation
- Tags/genres (top 10 by popularity)
- Artist relationships (members, collaborators, associated artists)
- Social media URLs (28+ platforms including Wikidata)
- AllMusic (AMG) IDs
- Spotify IDs
- Discogs IDs

#### TheAudioDB Data (Premium API)
- Artist biography (14 languages available)
- Artist thumbnail/avatar
- Record label, style, mood
- High-quality images (logo, cutout, banner, fanart)

### Album Enrichment (NEW!)

Automatically matches albums from your Airtable Albums table with MusicBrainz release data and enriches with:

- **MusicBrainz ID** - Unique identifier
- **MB Release Country** - Country of release
- **MB Barcode** - Album barcode/UPC
- **MB Status** - Official, Promotional, etc.
- **MB Label Info** - Record labels (comma-separated)
- **MB Track Count** - Total number of tracks
- **MB Media** - Format (CD, Vinyl, Digital, etc.)
- **MB Genres** - Top 10 genres by popularity (title-cased)
- **MB Tags** - Top 15 user tags (title-cased, excluding genres)
- **MB Artist Credit** - Full artist credits (important for compilations)
- **Soc AllMusic** - AllMusic.com URL
- **Soc Discogs** - Discogs.com URL
- **Soc Wikidata** - Wikidata URL

Smart album matching uses:
- Exact title matching with year validation
- Fuzzy matching (normalized names, removed articles)
- Release-group filtering (Albums only, not Singles/EPs)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add:
   - `AIRTABLE_TOKEN` - Your Airtable personal access token
   - `AUDIODB_API_KEY` - TheAudioDB API key (use "2" for testing, or premium key for full access)
   - `LIMIT` - Optional: limit number of records for testing
   
   **Album Enrichment Environment Variables:**
   - `ALBUMS_BASE_ID` - Airtable base ID for Albums table
   - `ALBUMS_TABLE_ID` - Table ID for Albums table

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

## Usage

```bash
npm start
```

Or test with a limit:
```bash
LIMIT=5 npm start
```

## Airtable Schema

### Artists Table

#### Required Fields
- **Soc Musicbrainz Id** (text) - MusicBrainz artist ID (MBID)
- **Full Name** or **Name** (text) - Artist name for logging

#### Updated MusicBrainz Fields
- **Date Formed Born** (text) - Formation or birth year
- **Soc MB Bio** (text) - Biography from TheAudioDB
- **Soc MB Avatar Url** (text) - Artist thumbnail from TheAudioDB
- **Soc MB Artist Type** (text) - person, group, orchestra, choir, etc.
- **Soc MB Gender** (text) - Male, Female, Other
- **Soc MB Genres** (text) - Top 10 genres/tags
- **Soc MB Country** (text) - Country code
- **Location Country** (text) - Country name
- **Soc MB Area** (text) - Geographic area
- **Soc MB Birthdate** (text) - Birth/formation date
- **Soc MB Disambiguation** (text) - Disambiguation comment
- **Soc MB Sort Name** (text) - Sortable artist name
- **Soc MB ISNI Code** (text) - International Standard Name Identifier(s)
- **Soc MB Aliases** (text) - Alternative names (comma-separated, max 20)
- **Soc MB Rating** (number) - User rating value (0-100)
- **Soc MB Members** (text) - Band members (comma-separated)
- **Soc MB Associated** (text) - Associated artists
- **Soc MB Collaborators** (text) - Collaboration artists
- **Soc MB Begin and end area** (text) - Birth and death locations
- **Check Musicbrainz** (date) - Last enrichment timestamp

### Social Media Fields (Updated only if empty)
- **Soc Instagram Url**
- **Soc Facebook**
- **Soc Youtube**
- **Soc Youtube Music**
- **Soc Tiktok**
- **Soc Bandsintown**
- **Soc Twitter**
- **Soc Shazam**
- **Soc Apple Music Url**
- **Soc Website**
- **Soc Amazon Music**
- **Soc Amazon Store**
- **Soc Chartmetric**
- **Soc Soundcloud**
- **Soc Wikipedia**
- **Soc Songkick**
- **Soc Deezer**
- **Soc Itunes**
- **Soc Lastfm**
- **Soc Googletrends**
- **Soc Pandora**
- **Soc Tidal**
- **Soc IMDb**
- **Soc Iheartradio**
- **Soc Discogs**
- **Soc Beatport**
- **Soc Audiomack**
- **Soc Bandcamp** ✅
- **Soc Myspace**
- **Soc Vevo**
- **Soc Genius**
- **Soc Setlistfm**
- **Soc Musixmatch**
- **Soc Qobuz**
- **Soc Napster**

#### ID Fields (from URL relationships)
- **Soc Spotify Artist Id**
- **Soc AMG Artist Id** (AllMusic)
- **Soc Discogs** (if Discogs URL found)

#### Optional TheAudioDB Fields (if you add columns)
- **Soc TADB ID** - TheAudioDB artist ID
- **Soc TADB Style** - Musical style
- **Soc TADB Mood** - Musical mood
- **Soc TADB Label** - Record label
- **Soc TADB Logo** - Logo image URL
- **Soc TADB Cutout** - Cutout image URL
- **Soc TADB Banner** - Banner image URL

### Albums Table

#### Required Fields
- **Album Name** (text) - Album title
- **Artist Name** (text) - Artist name (for matching)
- **Release Year** (text/number) - Year of release
- **Spotify Album Id** (text, optional) - For artist matching

#### Album Enrichment Fields
- **MusicBrainz ID** (text) - Unique release ID
- **MB Release Country** (text) - Country of release
- **MB Barcode** (text) - Album barcode/UPC
- **MB Status** (text) - Official, Promotional, etc.
- **MB Label Info** (text) - Record labels (comma-separated)
- **MB Track Count** (text) - Total number of tracks
- **MB Media** (text) - Format (CD, Vinyl, Digital Media, etc.)
- **MB Genres** (text) - Top 10 genres (title-cased, comma-separated)
- **MB Tags** (text) - Top 15 user tags (title-cased, comma-separated)
- **MB Artist Credit** (text) - Full artist credits (for compilations)
- **Soc AllMusic** (text) - AllMusic.com URL
- **Soc Discogs** (text) - Discogs.com URL  
- **Soc Wikidata** (text) - Wikidata URL

## API Rate Limits

### MusicBrainz
- **Rate Limit:** 1 request per second (STRICT - enforced by code)
- **Authentication:** Not required
- **User-Agent:** Required (automatically set)

### TheAudioDB
- **Rate Limit:** 2 requests per second
- **Free Test Key:** "2" (limited to test artists like Coldplay)
- **Premium Key:** $8/month for full artist database access

## How It Works

1. Fetches records from Airtable view "Musicbrainz"
2. For each artist record with a MusicBrainz ID:
   - **Artist Enrichment:**
     - Queries MusicBrainz API for artist data + relationships
     - Queries TheAudioDB API using MusicBrainz ID (if premium key available)
     - Extracts social media URLs from MusicBrainz relationships
     - Extracts artist collaborations, members, and associations
     - Updates Airtable artist fields
     - Only updates social URLs if currently empty (preserves manual entries)
   - **Album Enrichment:**
     - Fetches all release-groups (albums) for the artist
     - Fetches albums from Albums table matching artist name/Spotify ID
     - Matches MusicBrainz releases to Airtable albums using smart fuzzy matching
     - For each matched album:
       - Fetches release-group details (for genres/tags)
       - Selects first "Official" release from release-group
       - Fetches full release details (barcode, labels, tracks, etc.)
       - Extracts and formats all album metadata
       - Updates album record in Albums table
3. Respects rate limits (1 req/sec for MusicBrainz, 2 req/sec for TheAudioDB)

## Album Matching Logic

The script uses intelligent fuzzy matching to connect MusicBrainz releases with your Airtable albums:

1. **Exact Title Match:** Tries exact album title match with optional year validation
2. **Fuzzy Match:** Normalizes album names (removes articles like "The", "A", "An" and special characters)
3. **Year Validation:** If release year is available, ensures it matches
4. **Release-Group Filtering:** Only processes "Album" type releases (excludes Singles, EPs, etc.)

This ensures accurate matching even when album titles have minor differences.

Test with limited records:
```bash
# .env
LIMIT=5
```

## Example Output

```
🎵 MusicBrainz & TheAudioDB Enrichment
=====================================

📊 Base ID: appiYGWjEZVB76yyl
📋 Table: tblQ3DrCHekgRqj7Z
👁️  View: Musicbrainz

📥 Fetching records from view "Musicbrainz"...
✅ Found 10 records

📋 Processing: The Weeknd
   MBID: c8b03190-306c-4120-bb0b-6f2ebfc06ea9
  🔍 Fetching MusicBrainz data for c8b03190-306c-4120-bb0b-6f2ebfc06ea9...
  🎵 Fetching TheAudioDB data...
  ✅ TheAudioDB data found
  ✅ Updated successfully
     - MusicBrainz fields: 12
     - Social URLs added: 8

=====================================
✨ Enrichment Complete!
✅ Processed: 10
⏭️  Skipped: 0
=====================================
```
