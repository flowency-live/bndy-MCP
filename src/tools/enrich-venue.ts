// Enrich Venue Tool - MCP Implementation
// Calls POST /api/venues/:id/enrich to geocode/backfill existing venues missing google_place_id
// Prevents duplicates when source-runner runs against venues without place_id (ADR-018)

import { apiRequest } from '../utils/http-client.js';

export interface EnrichVenueParams {
  venueId: string | string[];  // Single ID or array for batch
  force?: boolean;             // Re-geocode even if already has place_id
}

interface EnrichVenueResponse {
  action: 'enriched' | 'skipped';
  geocodedPlaceId?: string;
  reason?: string;
  venue: {
    id: string;
    name: string;
    address: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    googlePlaceId: string | null;
  };
  needsReview?: boolean;
  error?: string;
}

interface EnrichResult {
  venueId: string;
  success: boolean;
  action?: string;
  googlePlaceId?: string;
  venueName?: string;
  error?: string;
  needsReview?: boolean;
}

export async function enrichVenue(params: EnrichVenueParams): Promise<string> {
  const { venueId, force = false } = params;

  // Handle single ID or array
  const venueIds = Array.isArray(venueId) ? venueId : [venueId];

  if (venueIds.length === 0) {
    return JSON.stringify({
      success: false,
      error: 'venueId is required',
      message: 'You must provide at least one venueId to enrich',
    }, null, 2);
  }

  // Validate all IDs are non-empty strings
  const invalidIds = venueIds.filter(id => !id || typeof id !== 'string');
  if (invalidIds.length > 0) {
    return JSON.stringify({
      success: false,
      error: 'Invalid venueId(s)',
      message: 'All venueIds must be non-empty strings',
    }, null, 2);
  }

  console.error(`[enrich_venue] Enriching ${venueIds.length} venue(s), force=${force}`);

  const results: EnrichResult[] = [];

  for (const id of venueIds) {
    try {
      console.error(`[enrich_venue] Processing venue: ${id}`);

      const response = await apiRequest<EnrichVenueResponse>(
        `/api/venues/${id}/enrich`,
        'POST',
        { force }
      );

      results.push({
        venueId: id,
        success: true,
        action: response.action,
        googlePlaceId: response.geocodedPlaceId || response.venue?.googlePlaceId || undefined,
        venueName: response.venue?.name,
      });

      console.error(`[enrich_venue] ${id}: ${response.action}`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[enrich_venue] ${id} Error:`, error);

      // Parse 422 (needs review) vs other errors
      if (errorMessage.includes('422')) {
        results.push({
          venueId: id,
          success: false,
          error: 'NEEDS_REVIEW',
          needsReview: true,
        });
      } else if (errorMessage.includes('404')) {
        results.push({
          venueId: id,
          success: false,
          error: 'VENUE_NOT_FOUND',
        });
      } else {
        results.push({
          venueId: id,
          success: false,
          error: errorMessage,
        });
      }
    }
  }

  // Summary stats
  const enriched = results.filter(r => r.action === 'enriched').length;
  const skipped = results.filter(r => r.action === 'skipped').length;
  const failed = results.filter(r => !r.success).length;
  const needsReview = results.filter(r => r.needsReview).length;

  return JSON.stringify({
    success: failed === 0,
    summary: {
      total: venueIds.length,
      enriched,
      skipped,
      failed,
      needsReview,
    },
    results,
    message: venueIds.length === 1
      ? (results[0].success
          ? `Venue ${results[0].venueName || venueIds[0]} ${results[0].action}`
          : `Failed to enrich venue: ${results[0].error}`)
      : `Processed ${venueIds.length} venues: ${enriched} enriched, ${skipped} skipped, ${failed} failed`,
  }, null, 2);
}
