#!/bin/bash

# Configuration
BATCH_LIMIT=500
SLEEP_SECONDS=10
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🌙 Starting MusicLinks Media Overnight Runner"
echo "   Directory: $REPO_DIR"
echo "   Batch Size: $BATCH_LIMIT"
echo "   Interval: $SLEEP_SECONDS seconds"
echo "------------------------------------------------"

# Ensure dependencies are installed and code is built
cd "$REPO_DIR"
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🏗️ Building project..."
npm run build

while true; do
    echo "🕒 [$(date)] Starting batch processing..."
    
    # Run the media enrichment script with the batch limit
    LIMIT=$BATCH_LIMIT node dist/ml-media-enrichment.js
    
    echo "💤 [$(date)] Batch complete. Sleeping for $SLEEP_SECONDS seconds..."
    sleep $SLEEP_SECONDS
done
