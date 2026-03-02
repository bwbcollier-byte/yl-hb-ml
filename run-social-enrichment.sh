#!/bin/bash
# ============================================================
# Social Profile Enrichment Pipeline
# Runs all social enrichers in logical dependency order
# ============================================================

echo "🚀 HB Talent Music Profiles - Social Enrichment Pipeline"
echo "=========================================================="

# Step 1: Spotify (foundation - enriches Spotify rows, needed by MusicFetch)
echo ""
echo "⠿ Step 1/4: Spotify Enricher"
echo "---------------------------"
npx ts-node src/social-enrich-spotify.ts
echo "✅ Spotify Enricher Done"

# Step 2: Deezer (independent - has its own IDs)
echo ""
echo "⠿ Step 2/4: Deezer Enricher"
echo "---------------------------"
npx ts-node src/social-enrich-deezer.ts
echo "✅ Deezer Enricher Done"

# Step 3: MusicBrainz (independent - has its own MBIDs, also discovers new links)
echo ""
echo "⠿ Step 3/4: MusicBrainz Enricher"
echo "---------------------------------"
npx ts-node src/social-enrich-musicbrainz.ts
echo "✅ MusicBrainz Enricher Done"

# Step 4: AudioDB (depends on MusicBrainz rows being Done)
echo ""
echo "⠿ Step 4/4: TheAudioDB Enricher"
echo "--------------------------------"
npx ts-node src/social-enrich-audiodb.ts
echo "✅ AudioDB Enricher Done"

echo ""
echo "=========================================================="
echo "✨ All Social Enrichers Complete!"
echo "=========================================================="
