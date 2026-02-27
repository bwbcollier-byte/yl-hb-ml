# HB-Data-MusicArtists Enrichment Field Mappings

## Overview
The enrichment system now captures comprehensive data for **Albums**, **Concerts**, and **Related Artists** with proper linkage and full field population.

---

## 1. ALBUMS (media_profiles table)

### Fields Being Populated
| Database Field | Source | Example | Notes |
|---|---|---|---|
| `spotify_album_id` | `album.id` | `3OxfaVgvTxUTy7276t7SPU` | Primary unique identifier |
| `album_name` | `album.name` | `Hurry Up Tomorrow` | Album title |
| `spotify_artist_id` | Passed from enrichment | `1Xyo4u8uXC1ZmMpatF05PJ` | Artist Spotify ID |
| `spotify_artist_name` | Passed from enrichment | `The Weeknd` | Artist name |
| **`talent_profile_id`** | ✨ NEW - Linked record | UUID | **Links album to origin artist** |
| `spotify_type` | `album.type` | `ALBUM` | Content type |
| `cover_art_url` | `album.coverArt.sources[0].url` | `https://i.scdn.co/image/...` | Album artwork |
| `release_date` | `album.date` (formatted) | `2025-01-31` | Release date YYYY-MM-DD |
| `release_year` | `album.date.year` | `2025` | Release year |
| `track_count` | `album.tracks.totalCount` | `22` | Number of tracks |
| `label` | `album.label` | `XO / Republic Records` | Record label |
| `spotify_album_url` | Generated | `https://open.spotify.com/album/...` | Spotify link |
| `status` | System | `Updated` | Processing status |
| `sp_check` | System | `completed` | Last check timestamp |

### Data Flow
```
API Response: data.artistUnion.discography.albums.items[].releases.items[]
                                                        ↓
                                        Flatten nested structure
                                        ↓
                                  processAlbums()
                                        ↓
                                  upsertAlbum()
                                        ↓
                                  media_profiles (upsert)
```

---

## 2. CONCERTS (event_profiles table)

### Fields Being Populated
| Database Field | Source | Example | Notes |
|---|---|---|---|
| `spotify_id` | `concert.id` | `4OGFxVUIdefEl04D0OUKDB` | Primary unique identifier |
| **`talent_profile_id`** | ✨ NEW - Linked record | UUID | **Links concert to origin artist** |
| `title` | `concert.title` | `The Weeknd` | Concert title |
| **`status`** | ✨ NEW - Set to 'Todo' | `Todo` | Initial processing status |
| **`image`** | ✨ NEW - Artist image | URL | Artist avatar from origin record |
| `spotify_url` | `concert.uri` | `spotify:concert:4OGFxVUIdefEl04D0OUKDB` | Spotify URI |
| `spotify_title` | `concert.title` | `The Weeknd` | Event title |
| `spotify_category` | `concert.category` | `CONCERT` | Event category |
| **`spotify_festival`** | ✨ NEW - Yes/No format | `No` | Is it a festival? (boolean → text) |
| `spotify_venue_name` | `concert.venue.name` | `Estadio GNP Seguros` | Venue name |
| `spotify_location_name` | `concert.venue.location.name` | `Ciudad de México` | City/location |
| `spotify_latitude` | `concert.venue.coordinates.latitude` | `19.405199` | Venue latitude |
| `spotify_longitude` | `concert.venue.coordinates.longitude` | `-99.095618` | Venue longitude |
| **`spotify_artist_urls`** | ✨ NEW - Comma-separated | `spotify:artist:...,spotify:artist:...` | Artist Spotify URIs |
| **`spotify_artist_ids`** | ✨ NEW - Comma-separated | `id1,id2,...` | Artist IDs performing |
| **`spotify_artist_names`** | ✨ NEW - Comma-separated | `Artist1,Artist2,...` | Artist names performing |
| `spotify_date` | `concert.date.isoString` | `2026-04-20T21:00-06:00` | ISO formatted date |
| `sp_check` | System | `completed` | Last check timestamp |

### Data Flow
```
API Response: data.artistUnion.goods.events.concerts.items[]
                                                        ↓
                                        processConcerts()
                                                ↓
                                Extract venue coords, artist info
                                                ↓
                                          upsertConcert()
                                                ↓
                                      event_profiles (upsert)
```

---

## 3. RELATED ARTISTS (talent_profiles table)

### Fields Being Populated for New Related Artist Records
| Database Field | Source | Example | Notes |
|---|---|---|---|
| `spotify_id` | `artist.id` | `5cj0lLjcoR7YOSnhnX0Po5` | Primary unique identifier |
| `name` | `artist.profile.name` | `Doja Cat` | Artist name |
| **`sp_type`** | ✨ NEW - Set to 'Artist' | `Artist` | Record type |
| **`sp_avatar_image_urls`** | ✨ NEW - Avatar URL | URL | Artist avatar image |
| **`sp_image`** | ✨ NEW - Avatar URL | URL | Avatar for quick access |
| **`sp_data_status`** | ✨ NEW - Set to 'Todo' | `Todo` | Initial status for future enrichment |
| **`sp_artist_id`** | ✨ NEW - Same as spotify_id | `5cj0lLjcoR7YOSnhnX0Po5` | Duplicate field for queries |

### Fields Updated on ORIGIN Artist Record
When related artists are processed, the **origin artist record** is updated with:

| Database Field | Content | Example | Notes |
|---|---|---|---|
| **`sp_related_artist_ids`** | ✨ NEW - Comma-separated | `id1,id2,id3,...` | All 40 related artist IDs |
| **`sp_related_artist_names`** | ✨ NEW - Comma-separated, titlecase | `Doja Cat,The Weeknd,...` | All related artist names |
| `sp_data_status` | Updated to | `Complete` | Marks enrichment as done |
| `sp_check` | ISO timestamp | `2026-02-28T00:25:30Z` | When enrichment completed |

### Data Flow
```
API Response: data.artistUnion.relatedContent.relatedArtists.items[]
                                                        ↓
                                    processRelatedArtists()
                                                ↓
                        Create new talent_profiles for each related artist
                                                ↓
                        Update origin artist record with IDs & names
                                                ↓
                            talent_profiles (insert + update)
```

---

## Summary Statistics

### The Weeknd (Test Case)
- **Albums**: 10 captured (from 10 release groups)
- **Concerts**: 10 concerts (has 48 total in API)
- **Related Artists**: 40 available in API (processing captures metadata)
- **All fields**: ✅ Properly linked and populated

### Field Coverage
✅ **100% of required fields** are being populated  
✅ **Proper linking** between records (talent_profile_id in albums & concerts)  
✅ **Metadata enrichment** for related artists with avatars and status tracking  
✅ **Timestamp tracking** for all updates  

---

## Implementation Files

- **Main Logic**: `src/index.ts` (functions: `processAlbums`, `processConcerts`, `processRelatedArtists`, `enrichArtistFromSpotify`)
- **Database Layer**: `src/supabase.ts` (functions: `upsertAlbum`, `upsertConcert`, `createRelatedArtist`)
- **Compiled Output**: `dist/index.js`, `dist/supabase.js`

---

## Testing & Verification

Run verification scripts:
```bash
node verify-detailed.js    # Shows field population for existing data
node test-drake-enrichment.js  # Full enrichment test with fresh artist
```
