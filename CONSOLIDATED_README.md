# HB-Data-MusicArtists - Consolidated Music Artist Enrichment

This repository consolidates all music artist enrichment sources into a single codebase targeting the Profiles table.

## 🎯 Overview

**Target Airtable Table**: Profiles (`appiYGWjEZVB76yyl/tblQ3DrCHekgRqj7Z`)  
**Additional Table**: Albums (`appYXhhXgVkSblLdl/tblYaSMImRbOr9CX3`) - MusicBrainz only

## 📦 Three Enrichment Sources

### 1. Spotify Artist Enrichment (`src/index.ts`)
- **API**: RapidAPI Spotify API
- **Schedule**: Daily at 2 AM UTC
- **Workflow**: `.github/workflows/spotify-enrichment.yml`
- **Command**: `npm start` or `npm run dev`
- **Fields**: 20+ Spotify-specific fields (artist ID, popularity, followers, genres, images, etc.)
- **View**: "Spotify Process"

### 2. TheAudioDB Artist Enrichment (`src/adb-artist-enrichment.ts`)
- **API**: TheAudioDB Premium (API Key: 925704)
- **Schedule**: Daily at 3 AM UTC (runs after Spotify to use MusicBrainz IDs)
- **Workflow**: `.github/workflows/adb-enrichment.yml`
- **Command**: `npm run adb`
- **Fields**: 42 active fields (biography, social links, labels, locations, etc.)
- **View**: "ADB Process"
- **Features**:
  - Fallback search by artist name if MusicBrainz ID missing
  - Status tracking (Complete, Updated, Not Found, Error)
  - Update history logging
  - Batch updates (10 records per API call)

### 3. MusicBrainz Artist + Album Enrichment (`src/musicbrainz-artist-enrichment.ts`)
- **APIs**: 
  - MusicBrainz (open API, 1 req/sec rate limit)
  - TheAudioDB (combined enrichment)
- **Schedule**: Daily at 4 AM UTC
- **Workflow**: `.github/workflows/musicbrainz-enrichment.yml`
- **Command**: `npm run musicbrainz`
- **Fields**: 
  - Artists: 40+ fields (MusicBrainz ID, type, country, dates, disambiguation, etc.)
  - Albums: Release info, barcodes, labels, genres, tags
- **View**: "Musicbrainz"
- **Features**:
  - Social media URL extraction (28+ platforms)
  - Artist relationships (members, collaborators)
  - Smart album matching with fuzzy logic
  - Dual table enrichment (Artists + Albums)

## 🚀 Setup

### Required Environment Variables
```bash
# Airtable
AIRTABLE_TOKEN=pat.xxxxx

# For Spotify enrichment
RAPIDAPI_KEY=xxxxx

# For TheAudioDB + MusicBrainz enrichment
AUDIODB_API_KEY=925704

# Base/Table IDs (hardcoded in code but can override)
AIRTABLE_BASE_ID=appiYGWjEZVB76yyl
AIRTABLE_TABLE_ID=tblQ3DrCHekgRqj7Z
ALBUMS_BASE_ID=appYXhhXgVkSblLdl
ALBUMS_TABLE_ID=tblYaSMImRbOr9CX3
```

### GitHub Secrets
Configure these in repository settings:
- `AIRTABLE_TOKEN`
- `RAPIDAPI_KEY`
- `AUDIODB_API_KEY`

### Installation
```bash
npm install
npm run build
```

### Local Testing
```bash
# Test Spotify enrichment
npm start

# Test TheAudioDB enrichment
npm run adb

# Test MusicBrainz enrichment
npm run musicbrainz

# Build TypeScript
npm run build
```

## 📅 Workflow Schedule

| Workflow | Time (UTC) | Purpose |
|----------|------------|---------|
| Spotify | 2:00 AM | Populate basic artist data and MusicBrainz IDs |
| TheAudioDB | 3:00 AM | Enrich with detailed biography and social links |
| MusicBrainz | 4:00 AM | Add comprehensive metadata and album enrichment |

## 📊 Field Coverage

### Spotify Fields (20+)
- Soc Spotify Artist ID
- Soc Spotify Popularity
- Soc Spotify Followers
- Soc Spotify Genres
- Soc Spotify Image URL
- Soc Musicbrainz Id (critical for other enrichments)

### TheAudioDB Fields (42)
- Soc ADB Artist ID
- Soc ADB Status (Complete/Updated/Not Found/Error)
- ADB Updates (update history log)
- Soc ADB Biography, Biography EN/DE/FR/IT/etc.
- Soc ADB Label, Soc ADB Country, Soc ADB Location
- Social links: Twitter, Facebook, Instagram, YouTube, etc.
- Soc ADB Formed Year, Disbanded Year, Style, Mood, Genre

### MusicBrainz Fields (40+)
- Soc Musicbrainz Id
- Soc Musicbrainz Type, Country
- Soc Musicbrainz Begin Date, End Date
- Soc Musicbrainz Disambiguation
- Social URLs (28+ platforms)
- Artist relationships
- Release groups

### Album Fields (MusicBrainz only)
- Soc Musicbrainz Album ID
- Soc Musicbrainz Barcode
- Soc Musicbrainz Release Status
- Soc Musicbrainz Primary Type
- Soc Musicbrainz Labels
- Soc Musicbrainz Genres/Tags

## 🔄 Data Flow

1. **Spotify** (2 AM): Fetches basic artist data, **populates MusicBrainz ID** (critical for steps 2-3)
2. **TheAudioDB** (3 AM): Uses MusicBrainz ID to fetch detailed biography and social links
3. **MusicBrainz** (4 AM): Uses MusicBrainz ID to fetch comprehensive metadata + enriches albums

## 📝 Documentation

- [ADB_README.md](ADB_README.md) - TheAudioDB enrichment details
- [MUSICBRAINZ_README.md](MUSICBRAINZ_README.md) - MusicBrainz enrichment details
- [MUSICBRAINZ_GITHUB_SETUP.md](MUSICBRAINZ_GITHUB_SETUP.md) - Workflow configuration guide

## ⚠️ Important Notes

- **MusicBrainz ID dependency**: Spotify enrichment must run first to populate MusicBrainz IDs
- **Rate limits**: MusicBrainz has strict 1 req/sec limit (respect it!)
- **Batch updates**: TheAudioDB uses batch updates (10 records) to reduce API calls
- **Status tracking**: TheAudioDB tracks enrichment status and update history
- **Fallback logic**: TheAudioDB searches by artist name if MusicBrainz ID missing

## 🗑️ Migration Complete

This repo consolidates functionality from:
- ✅ `hb-spotify-full-enrichment` (original)
- ✅ `hb-musicbrainz-full-enrichment` (migrated - can be deleted)

All artist enrichment now managed in single codebase with three workflows.
