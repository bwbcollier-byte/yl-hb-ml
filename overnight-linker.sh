#!/bin/bash

# Configuration
LIMIT=1000
SLEEP_BETWEEN_ROUNDS=2

echo "🎬 Master Social Linker starting..."
echo "=================================================="

while true; do
    echo "[$(date +'%H:%M:%S')] Starting linking round..."
    
    # Run the linker script
    npx ts-node src/master-social-linker.ts
    
    echo "=================================================="
    echo "✨ Linking Round Complete!"
    
    # Check if we should continue
    # This is a bit redundant because the node script has a loop, 
    # but it helps if the node script crashes.
    
    echo "[$(date +'%H:%M:%S')] Checking for more records..."
    sleep $SLEEP_BETWEEN_ROUNDS
done
