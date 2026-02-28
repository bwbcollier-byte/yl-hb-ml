#!/bin/bash

echo "=========================================="
echo "🌙 Rovi Talent Overnight Runner"
echo "Press Ctrl+C at any time to softly stop."
echo "=========================================="

while true; do
  echo "[$(date +'%T')] Starting Rovi loop..."
  LIMIT=1000 npm run rovi
  
  echo "[$(date +'%T')] Sleeping for 15 seconds before the next round..."
  sleep 15
done
