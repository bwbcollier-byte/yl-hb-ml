#!/bin/bash
# ============================================================
# MusicBrainz from Spotify Profile Enrichment Pipeline (Overnight Version)
# Loops continuously to ensure progress even after timeouts
# ============================================================

echo "🚀 Starting MB from Spotify Nightly Runner..."
echo "=========================================================="
echo "Press Ctrl+C at any time to softly stop."
echo "=========================================================="

while true; do
    echo "[$(date +'%T')] Starting batch..."
    npx ts-node src/social-enrich-musicbrainz-from-spotify.ts
    
    echo "=========================================================="
    echo "✨ Round Complete. Sleeping for 15s before next round..."
    sleep 15
done
