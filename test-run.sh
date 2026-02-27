#!/bin/bash
echo "🧪 Testing Spotify Enrichment..."
echo ""
echo "📋 Building..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo ""
echo "🚀 Running (with LIMIT=1 for testing)..."
LIMIT=1 node dist/index.js

echo ""
echo "✅ Test complete - check Supabase talent_profiles table"
