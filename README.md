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

# Performance Settings
CONCURRENCY=5  # Process 5 artists in parallel (default: 5)
LIMIT=10       # Optional: Limit records for testing
```


## Rovi Artist Enrichment

Enriches artist records in Airtable with Rovi Music data. Uses interactive or environment-based record selection, batch processing, and robust error handling.

### Environment Variables
```env
# Airtable Configuration
AIRTABLE_TOKEN=pat.xxxxxxxxxxxxx
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_ID=your_table_id
AIRTABLE_VIEW_NAME=Rovi Process

# Rovi API (placeholder, update as needed)
ROVI_API_KEY=your_rovi_api_key

# Optional
LIMIT=10  # Limit records for testing
```

### Usage
```bash
# Build TypeScript
npm run build

# Run Rovi enrichment
npm run rovi-enrich
# Or directly:
npx ts-node src/rovi-artist-enrichment.ts
```

### Processing Flow
1. Fetch artists from the Airtable view (default: "Rovi Process")
2. For each artist, call the Rovi API (simulated in placeholder)
3. Update Airtable with Rovi fields (ID, genres, bio, image, etc.)
4. Status and error handling as with other enrichments

---
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

### Parallel Processing
- **Concurrency**: Processes 5 artists simultaneously by default (configurable via `CONCURRENCY` env var)
- **Thread-Safe**: API key rotation uses mutex for safe parallel access
- **Batch Processing**: Profile updates happen in parallel batches

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
2. **Target Table**: Query by Spotify ID to find existing re

### Batch Operations (Airtable API Optimization)
All creates use batch operations (up to 10 records at a time):
- **Albums**: Batch create reduces API calls by ~80%
- **Concerts**: Batch create with artist processing
- **Research Records**: Batch create for both related artists and concert artists
- **Impact**: ~68% reduction in total API calls

**Example Savings:**
- Old: 1 artist with 15 albums = 19 API calls
- New: 1 artist with 15 albums = 6 API calls (68% reduction)cords
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
- **Processing Speed**: 5x faster with parallel processing
- **API Efficiency**: 68% reduction in Airtable API calls
- **Artists Processed**: 27 (5 at a time in parallel)
- **Albums Created**: 285 (batch creates of 10)
- **Concerts Created**: 8 (batch creates)
- **Research Records**: 3 new artists discovered (batch creates)
- **API Keys Utilized**: 11 keys rotating (500K/200 per month limits)
- **Throughput**: ~60-100 artists/hour (with full enrichment
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

### Run with Interactive Prompt
```bash
npm start
```
When you run the script, you'll be prompted to enter the number of artists to process:
```
🎵 Spotify Artist Enrichment Started
🔑 Using RapidAPI with key rotation (11 keys)
⚡ Parallel processing: 5 artists at a time

🔢 How many artists to process? (press Enter for all): 10
Processing 10 artists...
```

### Run with Environment Variable (Non-Interactive)
```bash
LIMIT=5 npm start
```
Skip the prompt and process exactly 5 artists.

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
