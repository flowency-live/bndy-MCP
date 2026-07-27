// Create Venue Tool - MCP Implementation (FIXED)
// 1. Searches Google Places for venue details
// 2. Calls /api/venues/find-or-create with place data

import { findPlace } from '../utils/google-places.js';
import { apiRequest, ApiError } from '../utils/http-client.js';
import { normalizeExternalIds } from '../utils/external-ids.js';

interface CreateVenueParams {
  name: string;
  address: string;
  city: string;
  facebookUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  externalIds?: Array<{ source: string; id: string }>;
}

export async function createVenue(params: CreateVenueParams): Promise<string> {
  const { name, address, city, facebookUrl } = params;

  console.error(`[create_venue] Creating venue "${name}" in ${city}`);

  try {
    // 2026-07-27 AUDIT FIX (F2/#1 dupe generator): previously this tool
    // DISCARDED caller-supplied googlePlaceId/latitude/longitude/address,
    // re-geocoded "name, city" only, and blind-trusted candidates[0] — a
    // near-miss geocode meant a different place_id and therefore a duplicate
    // venue. Now: an explicit googlePlaceId is HONOURED (no re-geocode), and
    // the geocode query includes the address for disambiguation.
    let placeResult: { name: string; address: string; placeId: string; latitude?: number; longitude?: number } | null = null;

    if (params.googlePlaceId && params.googlePlaceId.trim()) {
      placeResult = {
        name,
        address,
        placeId: params.googlePlaceId.trim(),
        latitude: params.latitude,
        longitude: params.longitude,
      };
      console.error(`[create_venue] Using caller-supplied googlePlaceId ${placeResult.placeId} (no re-geocode)`);
    } else {
      // Include the address in the query — it is the most disambiguating
      // field the caller supplies ("The Swan, 12 High St, Congleton" not
      // just "The Swan, Congleton").
      const searchQuery = address ? `${name}, ${address}, ${city}` : `${name}, ${city}`;
      placeResult = await findPlace(searchQuery);

      if (!placeResult && address) {
        // One retry without the address in case a malformed address broke the search
        placeResult = await findPlace(`${name}, ${city}`);
      }
    }

    if (!placeResult) {
      return JSON.stringify({
        success: false,
        error: 'Venue not found in Google Places',
        message: `Could not find "${name}" in ${city} on Google Maps. Please provide more specific address or try manual creation.`,
        suggestion: `Try searching for the full address instead of just the venue name.`
      }, null, 2);
    }

    // STEP 2: Call BNDY /api/venues/find-or-create with Google Place data
    // Normalize incoming externalIds to strip any doubled prefixes
    const normalizedExternalIds = normalizeExternalIds(params.externalIds || []);

    const venueData: any = {
      name: placeResult.name,
      address: placeResult.address,
      city: city,
      googlePlaceId: placeResult.placeId,
      latitude: placeResult.latitude,
      longitude: placeResult.longitude,
      // External IDs for cross-referencing (normalized)
      externalIds: normalizedExternalIds,
      // AI creation flags
      ai_created: true,
      needs_review: true,
      created_source: 'mcp_ai_import'
    };

    // Add Facebook URL if provided
    if (facebookUrl) {
      venueData.socialMediaUrls = [facebookUrl];
    }

    const result = await apiRequest<any>('/api/venues/find-or-create', 'POST', venueData);

    console.error(`[create_venue] Result: ${result.matchMethod}`);

    // STEP 3: Return formatted response
    return JSON.stringify({
      success: true,
      venue: {
        id: result.id,
        name: result.name,
        address: result.address,
        city: city,
        latitude: result.latitude,
        longitude: result.longitude,
        googlePlaceId: result.googlePlaceId,
        matchMethod: result.matchMethod
      },
      message: result.matchMethod === 'new_venue_created'
        ? `NEW venue "${result.name}" created successfully with Google Place ID`
        : `EXISTING venue "${result.name}" found (${result.matchMethod})`,
      isNew: result.matchMethod === 'new_venue_created',
      matchConfidence: result.matchConfidence || 100
    }, null, 2);

  } catch (error: any) {
    console.error(`[create_venue] Error:`, error);

    // Server hard-gate bounce: a venue with this google_place_id already
    // exists — match signal, not failure.
    if (error instanceof ApiError && error.isDuplicate) {
      const existingId = error.body?.existingId || null;
      return JSON.stringify({
        success: false,
        action: 'duplicate',
        error: 'DUPLICATE_VENUE',
        existingVenueId: existingId,
        message: existingId
          ? `The backend uniqueness gate bounced this create: a venue with this Google Place ID already exists (id: ${existingId}). USE THE EXISTING RECORD.`
          : 'The backend uniqueness gate bounced this create: a venue with this Google Place ID already exists. Use search_venue / list_venues to find it and reuse its id.',
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to create venue. No venue was created (fail closed).',
      details: error.stack
    }, null, 2);
  }
}
