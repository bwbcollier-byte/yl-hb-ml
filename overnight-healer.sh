#!/bin/bash

# Configuration
SLEEP_BETWEEN_ROUNDS=2

echo "🎬 Master Social Healer starting..."
echo "=================================================="

while true; do
    echo "[$(date +'%H:%M:%S')] Starting healing round..."
    
    # Run the healer script
    npx ts-node src/heal-missing-socials.ts
    
    echo "=================================================="
    echo "✨ Healing Round Complete!"
    
    echo "[$(date +'%H:%M:%S')] Checking for more records..."
    sleep $SLEEP_BETWEEN_ROUNDS
done
