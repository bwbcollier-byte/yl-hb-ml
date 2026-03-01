#!/bin/bash

# Configuration
LIMIT=1000
SLEEP_BETWEEN_ROUNDS=60

echo "🎬 Deezer Social Profile Enrichment starting..."
echo "=================================================="

while true; do
    echo "[$(date +'%H:%M:%S')] Starting enrichment round..."
    
    # Run the enrichment script
    LIMIT=$LIMIT npx ts-node src/deezer-social-enrichment.ts
    
    echo "=================================================="
    echo "✨ Deezer Processing Round Complete!"
    echo "[$(date +'%H:%M:%S')] Sleeping for $SLEEP_BETWEEN_ROUNDS seconds before the next round..."
    sleep $SLEEP_BETWEEN_ROUNDS
done
