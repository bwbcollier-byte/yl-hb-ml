# HB Spotify Full Enrichment

Comprehensive Spotify artist data enrichment system that populates Airtable with detailed artist information, related artists, albums, and concert data using RapidAPI Spotify endpoints.

## Features

- **Artist Profile Enrichment**: Followers, monthly listeners, world rank, verified status, images
- **Top Cities Data**: Track top 5 listening cities with listener counts
- **Related Artists**: Automatic discovery and research record creation for related artists
- **Album Processing**: Complete discography with 3-way deduplication
- *Data Mappings

### Artist Profile Fields (33+)
- **Basic Stats**: Followers, Monthly Listeners, World Rank, Verified
- **Images**: Gallery Images Count, Avatar Images Count, Image URLs
- **Top Cities**: 5 locations with listener counts
- **Counts**: Concerts, Albums, Singles, Compilations, Popular Releases
- **External Links**: Instagram, Twitter, Facebook, YouTube, TikTok, Website, etc.
- **Running Stats**: Historical tracking with MM.DD.YYYY timestamps
  - Followers, Listeners, World Rank, Top Locations
- **Related Artists**: Count and automatic research record creation

### Album Fields (13)
- Spotify Album Id, Url, Name, Type (title-cased)
- Release Date, Label, Total Tracks
- Artist Ids, Names, Urls
- Cover Art URL

### Concert Fields (14)
- Title (title-cased), Status, Date (YYYY-MM-DD)
- Spotify Id, Url, Title, Category (title-cased)
- Festival (Yes/No), Venue Name, Location Name (title-cased)
- Latitude, Longitude (coordinates)
- Artist Urls, Ids, Names (title-cased, comma-separated)

## API Integration

### Spotify RapidAPI
- **Artist Data**: POST `https://spotify-api25.p.rapidapi.com/getartist`
- **Albums**: GET `https://spotify81.p.rapidapi.com/artist_albums`
- **Rate Limiting**: 11 rotating API keys for distribution
  - 7 keys: 500,000 requests/month
  - 4 keys: 200 requests/month
  - All keys: 1000 requests/hour

### Response Structure
```json
{
  "data": {
    "artistUnion": {
      "stats": { "followers": 12332576, "monthlyListeners": 18068844 },
      "relatedContent": { "relatedArtists": { "items": [...] } },
      "goods": { "events": { "concerts": { "items": [...] } } },
      "discography": { "albums": {...}, "singles": {...} },
      "profile": { "verified": true },
      "externalLinks": { "items": [...] }
    }
  }
}
```
```
- **Table ID**: tblYaSMImRbOr9CX3
- 13 fields including release dates and types

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file:

```env
# Airtable Configuration
AIRTABLE_TOKEN=pat.xxxxxxxxxxxxx
AIRTABLE_BASE_ID=appiYGWjEZVB76yyl
AIRTABLE_TABLE_ID=tblQ3DrCHekgRqj7Z
AIRTABLE_VIEW_NAME=viwyL6dqnZWsdT7Sf

# Optional: Limit records for testing
LIMIT=5
```

## Usage

### Local Execution
```bash
# Build TypeScript
npm run build

# Run enrichment
npm start
```

### GitHub Actions (Automated)
The workflow runs daily at 2 AM UTC and can be triggered manually from the Actions tab.

## Processing Logic

### Artist Enrichment Flow
1. Fetch artists from "Spotify Process" view
2. For each artist with `Soc Spotify Id`:
   - Fetch artist data from Spotify API
   - Update 33+ profile fields
   - Extract external links (only if empty)
   - Process related artists (3-way deduplication)
   - Fetch and process albums
   - Extract concert data
   - Update tracking records
   - Log detailed changes

### 3-Way Deduplication
All entity processing (artists, albums, concerts) performs three checks:
1. **Tracking Record**: Check Checked Ids field
2. **Target Table**: Query by Spotify ID to find existing records
3. **Research Table**: Query to avoid duplicate research records

### Skip Optimization
- **Albums**: Skip if `Soc SP Album Release Ids` count matches `Soc Spotify Albums Count`
- **Concerts**: Skip if already processed in tracking record

### Concert Artist Discovery
When processing concerts, the system:
1. Extracts all participating artists from concert lineup
2. Performs 3-way deduplication
3. Creates research records for newly discovered artists
4. Logs: `🎤 Created research record for concert artist: {name}`

## Date Formats
- **Running Stats**: MM.DD.YYYY (e.g., "01.15.2025")
- **Concert Dates**: YYYY-MM-DD (e.g., "2025-06-14")

## Title-Casing
Automatically applied to:
- Title, Spotify Title, Category (concerts)
- Venue Name, Location Name (concerts)
- Artist Names (concerts)
- Spotify Type (albums)

## Performance Statistics
Recent production run (27 artists):
- **Artists Processed**: 27
- **Albums Created**: 285
- **Concerts Created**: 8
- **Research Records**: 3 new artists discovered
- **API Keys Rotated**: 11 keys (500K/200 per month limits)

## Error Handling
- Validates Spotify ID presence before processing
- Handles API rate limits with key rotation
- Logs detailed errors with artist context
- Updates `Soc SP Data Status` field for tracking
- Continues processing remaining artists on individual errors

## GitHub Actions Configuration

### Required Secrets
Set in repository Settings → Secrets → Actions:
- `AIRTABLE_TOKEN`: Your Airtable Personal Access Token

### Workflow Schedule
- **Automated**: Daily at 2:00 AM UTC
- **Manual**: Via workflow_dispatch trigger

## Development

### Build
```bash
npm run build
```

### Test with Limit
```bash
export LIMIT=5
npm start
```

### Local Testing
The `.env` file allows you to test locally before deploying to GitHub Actions.

## Dependencies
- `airtable` - Airtable SDK
- `dotenv` - Environment variable loading
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `@types/node` - Node.js type definitions

## License
ISC

### 3. Install Dependencies

```bash
npm install
```

### 4. Run

```bash
npm start
```

## Rate Limiting

- **Spotify API**: ~180 requests/minute
- **Script**: 500ms delay between artists (120/minute)
- **Automatic retry** on 429 (rate limit) responses
- **Exponential backoff** on errors

## Error Handling

- **Not Found**: Sets status to "Not Found" if Spotify ID invalid
- **API Errors**: Sets status to "Error" and logs issue
- **Rate Limits**: Automatically waits and retries

## Testing

Use `LIMIT=5` in `.env` to test with first 5 records:

```bash
LIMIT=5 npm start
```

## Example Output

```
🎵 Spotify Artist Enrichment Started
📊 Base: appiYGWjEZVB76yyl
📋 Table: tblQ3DrCHekgRqj7Z
👁️  View: viwyL6dqnZWsdT7Sf

🔑 Getting Spotify access token...
✅ Spotify access token obtained

📋 Found 23 records to process

📋 Processing: Pitbull (0TnOYISbd1XYRBk9myaseg)
✅ Updated: Pitbull
   Followers: 12414574
   Popularity: 85
   Genres: dance pop, miami hip hop, pop
   Related Artists: 10

✅ Processing Complete!
   Processed: 23
   Skipped: 0
   Errors: 0
```
