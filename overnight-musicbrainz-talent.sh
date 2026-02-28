#!/bin/bash

echo "=========================================="
echo "🌙 MusicBrainz Talent Overnight Runner"
echo "Press Ctrl+C at any time to softly stop."
echo "=========================================="

while true; do
  echo "[$(date +'%T')] Starting MusicBrainz loop..."
  LIMIT=1000 npm run musicbrainz
  
  echo "[$(date +'%T')] Sleeping for 15 seconds before the next round..."
  sleep 15
done
