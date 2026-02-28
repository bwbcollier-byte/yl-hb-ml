#!/bin/bash

echo "=========================================="
echo "🌙 Audiodb Talent Overnight Runner"
echo "Press Ctrl+C at any time to softly stop."
echo "=========================================="

while true; do
  echo "[$(date +'%T')] Starting AudioDB loop..."
  LIMIT=1000 npm run adb
  
  echo "[$(date +'%T')] Sleeping for 15 seconds before the next round..."
  sleep 15
done
