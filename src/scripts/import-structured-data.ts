#!/usr/bin/env npx ts-node
/**
 * BNDY Structured Data Import Script
 *
 * Uses the SAME validation endpoints as MCP tools:
 * - POST /api/artists/community (duplicate check + validation)
 * - POST /api/venues/find-or-create (Google Places + duplicate check + enrichment)
 * - POST /api/events/community (requires valid artist/venue IDs)
 *
 * Features:
 * - Progress file (resume from interruption)
 * - Rate limiting (avoid API throttling)
 * - ID mapping (local IDs → BNDY UUIDs)
 * - Detailed logging
 *
 * Usage:
 *   npx ts-node src/scripts/import-structured-data.ts <path-to-json>
 */

import * as fs from 'fs';
import * as path from 'path';
import { findPlace } from '../utils/google-places.js';
import { apiRequest } from '../utils/http-client.js';

// ============== Types ==============

interface StructuredData {
  _meta: {
    schema: string;
    generated_utc: string;
    counts: {
      artists: number;
      venues: number;
      events: number;
    };
  };
  artists: Record<string, ArtistData>;
  venues: Record<string, VenueData>;
  events: Record<string, EventData>;
}

interface ArtistData {
  id: string;
  name: string;
  aliases: string[];
  bio: string | null;
  act_type: string | null;
  genres: string[];
  cover_type: string | null;
  location: {
    city?: string;
    region?: string;
    country?: string;
  };
  urls: Array<{ kind: string; url: string }>;
  notes: string[];
  source_refs: string[];
}

interface VenueData {
  id: string;
  name: string;
  aliases: string[];
  location: {
    town?: string;
    region?: string;
    country?: string;
  };
  address: string | null;
  urls: Array<{ kind: string; url: string }>;
  notes: string[];
  source_refs: string[];
}

interface EventData {
  id: string;
  artist_id: string;
  venue_id: string;
  date: string;
  time: string | null;
  title: string | null;
  status: string;
  source: string | null;
}

interface ProgressState {
  artistIdMap: Record<string, string>;  // local ID → BNDY UUID
  venueIdMap: Record<string, string>;   // local ID → BNDY UUID
  completedArtists: string[];
  completedVenues: string[];
  completedEvents: string[];
  failedArtists: Array<{ id: string; error: string }>;
  failedVenues: Array<{ id: string; error: string }>;
  failedEvents: Array<{ id: string; error: string }>;
  startedAt: string;
  lastUpdated: string;
}

// ============== Config ==============

const DELAY_BETWEEN_CALLS_MS = 500;  // Rate limiting
const PROGRESS_FILE = 'import-progress.json';

// ============== Helpers ==============

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress(progressPath: string): ProgressState {
  if (fs.existsSync(progressPath)) {
    console.log(`📂 Loading progress from ${progressPath}`);
    return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  }
  return {
    artistIdMap: {},
    venueIdMap: {},
    completedArtists: [],
    completedVenues: [],
    completedEvents: [],
    failedArtists: [],
    failedVenues: [],
    failedEvents: [],
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(progressPath: string, state: ProgressState): void {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2));
}

function mapActType(actType: string | null): string {
  if (!actType) return 'band';
  const lower = actType.toLowerCase();
  if (['solo', 'duo', 'trio', 'band', 'group', 'dj', 'collective'].includes(lower)) {
    return lower;
  }
  return 'band';
}

function extractUrl(urls: Array<{ kind: string; url: string }>, kind: string): string | undefined {
  const found = urls.find(u => u.kind === kind);
  return found?.url;
}

// ============== Import Functions ==============

async function importArtist(artist: ArtistData, state: ProgressState): Promise<string | null> {
  // Skip if already done
  if (state.completedArtists.includes(artist.id)) {
    console.log(`  ⏭️  Skipping ${artist.name} (already imported)`);
    return state.artistIdMap[artist.id];
  }

  console.log(`  🎸 Creating artist: ${artist.name}`);

  try {
    const artistData = {
      name: artist.name,
      artist_type: mapActType(artist.act_type),
      location: artist.location.city || artist.location.region || 'UK',
      bio: artist.bio || '',
      genres: artist.genres || [],
      facebookUrl: extractUrl(artist.urls, 'facebook') || '',
      instagramUrl: extractUrl(artist.urls, 'instagram') || '',
      spotifyUrl: extractUrl(artist.urls, 'spotify') || '',
      websiteUrl: extractUrl(artist.urls, 'website') || '',
      ai_created: true,
      source: 'bulk_import'
    };

    const response = await apiRequest<any>('/api/artists/community', 'POST', artistData);

    const bndyId = response.artist?.id || response.id;
    if (bndyId) {
      state.artistIdMap[artist.id] = bndyId;
      state.completedArtists.push(artist.id);
      console.log(`     ✅ Created: ${bndyId}`);
      return bndyId;
    } else {
      throw new Error('No ID returned from API');
    }
  } catch (error: any) {
    console.log(`     ❌ Failed: ${error.message}`);
    state.failedArtists.push({ id: artist.id, error: error.message });
    return null;
  }
}

async function importVenue(venue: VenueData, state: ProgressState): Promise<string | null> {
  // Skip if already done
  if (state.completedVenues.includes(venue.id)) {
    console.log(`  ⏭️  Skipping ${venue.name} (already imported)`);
    return state.venueIdMap[venue.id];
  }

  const city = venue.location.town || venue.location.region || 'UK';
  console.log(`  🏠 Creating venue: ${venue.name}, ${city}`);

  try {
    // Step 1: Google Places lookup (same as MCP tool)
    const searchQuery = `${venue.name}, ${city}, UK`;
    const placeResult = await findPlace(searchQuery);

    if (!placeResult) {
      console.log(`     ⚠️  Not found in Google Places, skipping`);
      state.failedVenues.push({ id: venue.id, error: 'Not found in Google Places' });
      return null;
    }

    // Step 2: Call find-or-create (same as MCP tool)
    const venueData = {
      name: placeResult.name,
      address: placeResult.address,
      city: city,
      googlePlaceId: placeResult.placeId,
      latitude: placeResult.latitude,
      longitude: placeResult.longitude,
      ai_created: true,
      needs_review: true,
      created_source: 'bulk_import'
    };

    const facebookUrl = extractUrl(venue.urls, 'facebook');
    if (facebookUrl) {
      (venueData as any).socialMediaUrls = [facebookUrl];
    }

    const result = await apiRequest<any>('/api/venues/find-or-create', 'POST', venueData);

    const bndyId = result.id;
    if (bndyId) {
      state.venueIdMap[venue.id] = bndyId;
      state.completedVenues.push(venue.id);
      const status = result.matchMethod === 'new_venue_created' ? 'NEW' : `MATCHED (${result.matchMethod})`;
      console.log(`     ✅ ${status}: ${bndyId}`);
      return bndyId;
    } else {
      throw new Error('No ID returned from API');
    }
  } catch (error: any) {
    console.log(`     ❌ Failed: ${error.message}`);
    state.failedVenues.push({ id: venue.id, error: error.message });
    return null;
  }
}

async function importEvent(event: EventData, state: ProgressState): Promise<string | null> {
  // Skip if already done
  if (state.completedEvents.includes(event.id)) {
    console.log(`  ⏭️  Skipping event ${event.id} (already imported)`);
    return event.id;
  }

  // Get mapped IDs
  const artistId = state.artistIdMap[event.artist_id];
  const venueId = state.venueIdMap[event.venue_id];

  if (!artistId) {
    console.log(`  ⏭️  Skipping event ${event.id} - artist not imported`);
    state.failedEvents.push({ id: event.id, error: `Artist ${event.artist_id} not imported` });
    return null;
  }

  if (!venueId) {
    console.log(`  ⏭️  Skipping event ${event.id} - venue not imported`);
    state.failedEvents.push({ id: event.id, error: `Venue ${event.venue_id} not imported` });
    return null;
  }

  console.log(`  📅 Creating event: ${event.date}`);

  try {
    const eventData = {
      artistId: artistId,
      venueId: venueId,
      date: event.date,
      startTime: event.time || '20:00',  // Default to 8pm if not specified
      title: event.title || undefined,
      isPublic: true,
      source: 'bulk_import'
    };

    const response = await apiRequest<any>('/api/events/community', 'POST', eventData);

    const bndyId = response.id || response.event?.id;
    if (bndyId) {
      state.completedEvents.push(event.id);
      console.log(`     ✅ Created: ${bndyId}`);
      return bndyId;
    } else {
      throw new Error('No ID returned from API');
    }
  } catch (error: any) {
    console.log(`     ❌ Failed: ${error.message}`);
    state.failedEvents.push({ id: event.id, error: error.message });
    return null;
  }
}

// ============== Main ==============

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx ts-node src/scripts/import-structured-data.ts <path-to-json>');
    process.exit(1);
  }

  const inputPath = args[0];
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  // Load data
  console.log(`\n📄 Loading data from ${inputPath}\n`);
  const data: StructuredData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  console.log(`Found:`);
  console.log(`  - ${Object.keys(data.artists).length} artists`);
  console.log(`  - ${Object.keys(data.venues).length} venues`);
  console.log(`  - ${Object.keys(data.events).length} events`);
  console.log('');

  // Load progress
  const progressPath = path.join(path.dirname(inputPath), PROGRESS_FILE);
  const state = loadProgress(progressPath);

  // Phase 1: Artists
  console.log('═══════════════════════════════════════════');
  console.log('PHASE 1: Importing Artists');
  console.log('═══════════════════════════════════════════\n');

  const artists = Object.values(data.artists);
  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    console.log(`[${i + 1}/${artists.length}]`);
    await importArtist(artist, state);
    saveProgress(progressPath, state);
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log(`\n✅ Artists: ${state.completedArtists.length} imported, ${state.failedArtists.length} failed\n`);

  // Phase 2: Venues
  console.log('═══════════════════════════════════════════');
  console.log('PHASE 2: Importing Venues');
  console.log('═══════════════════════════════════════════\n');

  const venues = Object.values(data.venues);
  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    console.log(`[${i + 1}/${venues.length}]`);
    await importVenue(venue, state);
    saveProgress(progressPath, state);
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log(`\n✅ Venues: ${state.completedVenues.length} imported, ${state.failedVenues.length} failed\n`);

  // Phase 3: Events
  console.log('═══════════════════════════════════════════');
  console.log('PHASE 3: Importing Events');
  console.log('═══════════════════════════════════════════\n');

  const events = Object.values(data.events);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`[${i + 1}/${events.length}]`);
    await importEvent(event, state);
    saveProgress(progressPath, state);
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  console.log(`\n✅ Events: ${state.completedEvents.length} imported, ${state.failedEvents.length} failed\n`);

  // Summary
  console.log('═══════════════════════════════════════════');
  console.log('IMPORT COMPLETE');
  console.log('═══════════════════════════════════════════\n');

  console.log(`Artists: ${state.completedArtists.length}/${artists.length}`);
  console.log(`Venues:  ${state.completedVenues.length}/${venues.length}`);
  console.log(`Events:  ${state.completedEvents.length}/${events.length}`);

  if (state.failedArtists.length > 0) {
    console.log(`\n❌ Failed Artists:`);
    state.failedArtists.forEach(f => console.log(`   - ${f.id}: ${f.error}`));
  }

  if (state.failedVenues.length > 0) {
    console.log(`\n❌ Failed Venues:`);
    state.failedVenues.forEach(f => console.log(`   - ${f.id}: ${f.error}`));
  }

  if (state.failedEvents.length > 0) {
    console.log(`\n❌ Failed Events (first 10):`);
    state.failedEvents.slice(0, 10).forEach(f => console.log(`   - ${f.id}: ${f.error}`));
    if (state.failedEvents.length > 10) {
      console.log(`   ... and ${state.failedEvents.length - 10} more`);
    }
  }

  console.log(`\n📁 Progress saved to: ${progressPath}`);
  console.log('   (Re-run to resume from where you left off)\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
