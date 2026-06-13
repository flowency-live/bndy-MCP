// Create Venue Tool - MCP Implementation (FIXED)
// 1. Searches Google Places for venue details
// 2. Calls /api/venues/find-or-create with place data

import { findPlace } from '../utils/google-places.js';
import { apiRequest } from '../utils/http-client.js';
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
    // STEP 1: Search Google Places for this venue
    const searchQuery = `${name}, ${city}`;
    const placeResult = await findPlace(searchQuery);

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
    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to create venue',
      details: error.stack
    }, null, 2);
  }
}
