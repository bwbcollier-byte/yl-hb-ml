#!/bin/bash

echo "=========================================="
echo "🌙 Spotify Talent Overnight Runner"
echo "Press Ctrl+C at any time to softly stop."
echo "=========================================="

while true; do
  echo "[$(date +'%T')] Starting Spotify loop..."
  LIMIT=1000 npm run start
  
  echo "[$(date +'%T')] Sleeping for 15 seconds before the next round..."
  sleep 15
done
