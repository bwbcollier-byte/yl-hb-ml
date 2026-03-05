#!/bin/bash
# ============================================================
# Social Profile Enrichment Pipeline (Overnight Version)
# Loops continuously to ensure progress even after timeouts
# ============================================================

while true; do
    echo "🚀 HB Talent Music Profiles - Social Enrichment Round Starting..."
    echo "=========================================================="

    # Step 1: Spotify (foundation - enriches Spotify rows)
    echo "⠿ Step 1/5: Spotify Enricher"
    npx ts-node src/social-enrich-spotify.ts

    # Step 2: MusicFetch (Uses enriched Spotify IDs to find other links)
    echo "⠿ Step 2/5: MusicFetch Enricher"
    npx ts-node src/social-enrich-musicfetch.ts

    # Step 3: Deezer (independent enrichment)
    echo "⠿ Step 3/5: Deezer Enricher"
    npx ts-node src/social-enrich-deezer.ts

    # Step 4: MusicBrainz (discovers new links + enrich IDs)
    echo "⠿ Step 4/5: MusicBrainz Enricher"
    npx ts-node src/social-enrich-musicbrainz.ts

    # Step 5: AudioDB (depends on MusicBrainz IDs)
    echo "⠿ Step 5/6: TheAudioDB Enricher"
    npx ts-node src/social-enrich-audiodb.ts

    # Step 6: TMDB (discovers social IDs for people)
    echo "⠿ Step 6/6: TMDB Enricher"
    npx ts-node src/social-enrich-tmdb.ts

    echo "=========================================================="
    echo "✨ Round Complete. Sleeping for 30s before next round..."
    sleep 30
done
