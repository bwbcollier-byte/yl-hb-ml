#!/bin/bash

# MusicLinks Social Enrichment Overnight Script
# This runs the enrichment process in the background.

echo "🏁 Starting Overnight MusicLinks Enrichment..."
echo "📅 Date: $(date)"

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Run the enrichment script with npx ts-node
# We use a larger batch size for overnight runs if needed, 
# but the script itself manages the loop.
nohup npx ts-node src/enrich-social-links.ts > enrichment_overnight.log 2>&1 &

echo "🚀 Enrichment process started in background (PID: $!)."
echo "📜 Check enrichment_overnight.log for progress."
