// Bulk Import Tool - MCP Implementation
// Imports structured data (artists, venues, events) with deduplication
// Auto-chunks large imports to avoid API Gateway 30s timeout
// Uses the events-agent-lambda's resolveVenue/resolveArtist functions

import { apiRequest } from '../utils/http-client.js';

const CHUNK_SIZE = 8; // Process 8 items per batch to stay under 30s timeout

interface BulkImportParams {
  data?: {
    artists?: Record<string, any>;
    venues?: Record<string, any>;
    events?: Record<string, any>;
  };
  locationContext?: string;
  dryRun?: boolean;
}

interface BulkImportResponse {
  success: boolean;
  dryRun: boolean;
  artistIdMap: Record<string, string>;
  venueIdMap: Record<string, string>;
  results: {
    artists: { created: any[]; matched: any[]; failed: any[] };
    venues: { created: any[]; matched: any[]; failed: any[] };
    events: { created: any[]; skipped: any[]; failed: any[] };
  };
  summary: {
    artists: { total: number; created: number; matched: number; failed: number };
    venues: { total: number; created: number; matched: number; failed: number };
    events: { total: number; created: number; skipped: number; failed: number };
  };
}

function chunkObject<T>(obj: Record<string, T>, size: number): Record<string, T>[] {
  const entries = Object.entries(obj);
  const chunks: Record<string, T>[] = [];

  for (let i = 0; i < entries.length; i += size) {
    const chunk = entries.slice(i, i + size);
    chunks.push(Object.fromEntries(chunk));
  }

  return chunks;
}

function mergeResults(results: BulkImportResponse[]): {
  artistIdMap: Record<string, string>;
  venueIdMap: Record<string, string>;
  artists: { created: any[]; matched: any[]; failed: any[] };
  venues: { created: any[]; matched: any[]; failed: any[] };
  events: { created: any[]; skipped: any[]; failed: any[] };
} {
  const merged = {
    artistIdMap: {} as Record<string, string>,
    venueIdMap: {} as Record<string, string>,
    artists: { created: [] as any[], matched: [] as any[], failed: [] as any[] },
    venues: { created: [] as any[], matched: [] as any[], failed: [] as any[] },
    events: { created: [] as any[], skipped: [] as any[], failed: [] as any[] },
  };

  for (const result of results) {
    Object.assign(merged.artistIdMap, result.artistIdMap);
    Object.assign(merged.venueIdMap, result.venueIdMap);
    merged.artists.created.push(...result.results.artists.created);
    merged.artists.matched.push(...result.results.artists.matched);
    merged.artists.failed.push(...result.results.artists.failed);
    merged.venues.created.push(...result.results.venues.created);
    merged.venues.matched.push(...result.results.venues.matched);
    merged.venues.failed.push(...result.results.venues.failed);
    merged.events.created.push(...result.results.events.created);
    merged.events.skipped.push(...result.results.events.skipped);
    merged.events.failed.push(...result.results.events.failed);
  }

  return merged;
}

export async function bulkImport(params: BulkImportParams): Promise<string> {
  const { data, locationContext, dryRun } = params;

  if (!data) {
    return JSON.stringify({
      success: false,
      error: 'data parameter is required with artists, venues, and events objects'
    }, null, 2);
  }

  const artists = data.artists || {};
  const venues = data.venues || {};
  const events = data.events || {};

  const totalArtists = Object.keys(artists).length;
  const totalVenues = Object.keys(venues).length;
  const totalEvents = Object.keys(events).length;

  console.error(`[bulk_import] Starting bulk import`);
  console.error(`  - Artists: ${totalArtists}`);
  console.error(`  - Venues: ${totalVenues}`);
  console.error(`  - Events: ${totalEvents}`);
  console.error(`  - Location context: ${locationContext || 'Greater Manchester, UK'}`);
  console.error(`  - Dry run: ${dryRun || false}`);

  const allResults: BulkImportResponse[] = [];
  const accumulatedArtistIdMap: Record<string, string> = {};
  const accumulatedVenueIdMap: Record<string, string> = {};

  try {
    // Phase 1: Process artists in chunks
    const artistChunks = chunkObject(artists, CHUNK_SIZE);
    if (artistChunks.length > 0) {
      console.error(`[bulk_import] Processing ${totalArtists} artists in ${artistChunks.length} batches...`);

      for (let i = 0; i < artistChunks.length; i++) {
        console.error(`  Batch ${i + 1}/${artistChunks.length} (${Object.keys(artistChunks[i]).length} artists)`);

        const response = await apiRequest<BulkImportResponse>('/api/ingest/bulk-import', 'POST', {
          artists: artistChunks[i],
          venues: {},
          events: {},
          options: {
            locationContext: locationContext || 'Greater Manchester, UK',
            dryRun: dryRun || false
          }
        });

        allResults.push(response);
        Object.assign(accumulatedArtistIdMap, response.artistIdMap);
      }
    }

    // Phase 2: Process venues in chunks
    const venueChunks = chunkObject(venues, CHUNK_SIZE);
    if (venueChunks.length > 0) {
      console.error(`[bulk_import] Processing ${totalVenues} venues in ${venueChunks.length} batches...`);

      for (let i = 0; i < venueChunks.length; i++) {
        console.error(`  Batch ${i + 1}/${venueChunks.length} (${Object.keys(venueChunks[i]).length} venues)`);

        const response = await apiRequest<BulkImportResponse>('/api/ingest/bulk-import', 'POST', {
          artists: {},
          venues: venueChunks[i],
          events: {},
          options: {
            locationContext: locationContext || 'Greater Manchester, UK',
            dryRun: dryRun || false
          }
        });

        allResults.push(response);
        Object.assign(accumulatedVenueIdMap, response.venueIdMap);
      }
    }

    // Phase 3: Process events in chunks (with accumulated ID maps)
    // Events need the artist/venue ID maps, so we need to remap the local IDs
    const eventChunks = chunkObject(events, CHUNK_SIZE);
    if (eventChunks.length > 0) {
      console.error(`[bulk_import] Processing ${totalEvents} events in ${eventChunks.length} batches...`);

      for (let i = 0; i < eventChunks.length; i++) {
        console.error(`  Batch ${i + 1}/${eventChunks.length} (${Object.keys(eventChunks[i]).length} events)`);

        // For events, we need to pass the accumulated ID maps so the Lambda can resolve references
        // We send artists/venues as empty but include the events
        // The Lambda will need the ID maps - we pass them via a special field
        const response = await apiRequest<BulkImportResponse>('/api/ingest/bulk-import', 'POST', {
          artists: {},
          venues: {},
          events: eventChunks[i],
          options: {
            locationContext: locationContext || 'Greater Manchester, UK',
            dryRun: dryRun || false,
            // Pass pre-computed ID maps for event resolution
            artistIdMap: accumulatedArtistIdMap,
            venueIdMap: accumulatedVenueIdMap
          }
        });

        allResults.push(response);
      }
    }

    // Merge all results
    const merged = mergeResults(allResults);

    const summary = {
      artists: {
        total: totalArtists,
        created: merged.artists.created.length,
        matched: merged.artists.matched.length,
        failed: merged.artists.failed.length
      },
      venues: {
        total: totalVenues,
        created: merged.venues.created.length,
        matched: merged.venues.matched.length,
        failed: merged.venues.failed.length
      },
      events: {
        total: totalEvents,
        created: merged.events.created.length,
        skipped: merged.events.skipped.length,
        failed: merged.events.failed.length
      }
    };

    console.error(`[bulk_import] Complete`);
    console.error(`  Artists: ${summary.artists.created} created, ${summary.artists.matched} matched, ${summary.artists.failed} failed`);
    console.error(`  Venues: ${summary.venues.created} created, ${summary.venues.matched} matched, ${summary.venues.failed} failed`);
    console.error(`  Events: ${summary.events.created} created, ${summary.events.skipped} skipped, ${summary.events.failed} failed`);

    return JSON.stringify({
      success: true,
      dryRun: dryRun || false,
      summary,
      artistIdMap: merged.artistIdMap,
      venueIdMap: merged.venueIdMap,
      details: {
        artistsCreated: merged.artists.created,
        artistsMatched: merged.artists.matched,
        artistsFailed: merged.artists.failed,
        venuesCreated: merged.venues.created,
        venuesMatched: merged.venues.matched,
        venuesFailed: merged.venues.failed,
        eventsCreated: merged.events.created,
        eventsSkipped: merged.events.skipped,
        eventsFailed: merged.events.failed
      }
    }, null, 2);

  } catch (error: any) {
    console.error(`[bulk_import] Error:`, error);
    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to perform bulk import',
      partialResults: allResults.length > 0 ? {
        completedBatches: allResults.length,
        artistIdMap: accumulatedArtistIdMap,
        venueIdMap: accumulatedVenueIdMap
      } : undefined
    }, null, 2);
  }
}
