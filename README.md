# yl-hb-ml (Musiclinkss Enrichment Pipeline)

Automated pipeline for cross-platform music link enrichment using the Musiclinkss API via RapidAPI.

## Overview

This repository contains scripts and GitHub Actions workflows to:

1. **Social Enrichment**: Scan Spotify social profiles, fetch cross-platform links (Deezer, Apple, Youtube, etc.), and create/update "Music Links" records in Supabase.
2. **Media Enrichment**: Scan Spotify media records (albums), fetch cross-platform links, and update media profiles with missing URLs.

## Setup

1. **Environment Variables**:
   See `.env.example`. You need:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `RAPIDAPI_KEY_1` (Optionally up to `RAPIDAPI_KEY_10` for rotation)

2. **Installation**:

   ```bash
   npm install
   ```

3. **Build**:
   ```bash
   npm run build
   ```

## Usage

### Local Testing

- Social: `npm run social`
- Media: `npm run media`

### Overnight Scripts

For continuous processing:

- Social: `./overnight-ml-social.sh`
- Media: `./overnight-ml-media.sh`

### GitHub Actions

The workflows are located in `.github/workflows`. They run daily and can be triggered manually with a `record_limit` parameter.

## Database Schema

The pipeline adds and uses:

- `social_profiles.ml_check`
- `media_profiles.ml_check`
- Updates `workflow_logs`, `last_processed`, and `last_checked`.
