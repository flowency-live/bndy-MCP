// Google Places API Client

import { Client, PlaceInputType } from '@googlemaps/google-maps-services-js';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

if (!GOOGLE_API_KEY) {
  console.error('[WARNING] GOOGLE_PLACES_API_KEY not set! Venue creation will fail.');
}

const client = new Client({});

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Search for a place using text query
 * Returns the first/best match
 */
export async function findPlace(query: string): Promise<PlaceResult | null> {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_PLACES_API_KEY environment variable not set');
  }

  console.error(`[Google Places] Searching for: "${query}"`);

  try {
    const response = await client.findPlaceFromText({
      params: {
        input: query,
        inputtype: PlaceInputType.textQuery,
        fields: ['place_id', 'name', 'formatted_address', 'geometry'],
        key: GOOGLE_API_KEY,
      },
    });

    if (response.data.status !== 'OK' || !response.data.candidates || response.data.candidates.length === 0) {
      console.error(`[Google Places] No results for "${query}"`);
      return null;
    }

    const place = response.data.candidates[0];

    if (!place.place_id || !place.geometry?.location) {
      console.error(`[Google Places] Incomplete data for "${query}"`);
      return null;
    }

    const result: PlaceResult = {
      placeId: place.place_id,
      name: place.name || '',
      address: place.formatted_address || '',
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    };

    console.error(`[Google Places] Found: ${result.name} (${result.placeId})`);

    return result;
  } catch (error: any) {
    console.error(`[Google Places] Error:`, error.message);
    throw error;
  }
}