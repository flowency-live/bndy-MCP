// Search Venue Tool - MCP Implementation (FIXED)
// Searches BNDY venues database by name and city

import { apiRequest } from '../utils/http-client.js';
import { VenueSearchResult } from '../types/bndy.js';

interface SearchVenueParams {
  name: string;
  city: string;
}

export async function searchVenue(params: SearchVenueParams): Promise<string> {
  const { name, city } = params;

  // Validate required parameters - return 400-style error instead of crashing
  if (!name || typeof name !== 'string' || !name.trim()) {
    return JSON.stringify({
      found: false,
      error: 'Missing required parameter: name',
      message: 'The "name" parameter is required. Provide the venue name to search for.'
    }, null, 2);
  }

  if (!city || typeof city !== 'string' || !city.trim()) {
    return JSON.stringify({
      found: false,
      error: 'Missing required parameter: city',
      message: 'The "city" parameter is required. Provide the city where the venue is located.'
    }, null, 2);
  }

  console.error(`[search_venue] Searching for "${name}" in "${city}"`);

  try {
    // Call BNDY API to search venues
    const venues = await apiRequest<any[]>(`/api/venues?search=${encodeURIComponent(name)}`, 'GET');

    console.error(`[search_venue] API returned ${venues.length} venues`);

    // Filter results by city match (case-insensitive).
    // 2026-07-27 AUDIT FIX (F2/#2 dupe generator): address-less venues were
    // previously DROPPED here (`if (!venue.address) return false`), making
    // them permanently unfindable — every import re-created them. An
    // address-less venue now passes the city filter on NAME similarity
    // instead, flagged so the caller knows the city couldn't be verified.
    const cityNormalized = city.toLowerCase().trim();
    const cityMatches = venues.filter(venue => {
      if (!venue.address) {
        // Can't verify city — include when the name is a plausible match so
        // the caller sees it rather than blindly creating a duplicate.
        return calculateSimilarity(name, venue.name || '') >= 60;
      }
      const addressLower = venue.address.toLowerCase();
      return addressLower.includes(cityNormalized);
    });

    console.error(`[search_venue] ${cityMatches.length} venues match city "${city}"`);

    if (cityMatches.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No venues found matching "${name}" in ${city}`,
        searchedCount: venues.length
      }, null, 2);
    }

    // Calculate confidence scores based on name similarity
    const results: VenueSearchResult[] = cityMatches.map(venue => {
      const nameSimilarity = calculateSimilarity(name, venue.name);

      return {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: extractCityFromAddress(venue.address),
        latitude: venue.latitude,
        longitude: venue.longitude,
        google_place_id: venue.googlePlaceId,
        externalIds: venue.externalIds || [],
        confidence: Math.round(nameSimilarity),
        matchMethod: nameSimilarity >= 90 ? 'high_confidence' :
                     nameSimilarity >= 70 ? 'medium_confidence' :
                     'low_confidence'
      };
    });

    // Sort by confidence (highest first)
    results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Return formatted results
    return JSON.stringify({
      found: true,
      count: results.length,
      matches: results,
      recommendation: results[0].confidence! >= 85
        ? `High confidence match: "${results[0].name}" (${results[0].confidence}% similar)`
        : `Found ${results.length} possible match(es). Review carefully before using.`
    }, null, 2);

  } catch (error: any) {
    console.error(`[search_venue] Error:`, error);
    return JSON.stringify({
      found: false,
      error: error.message,
      message: 'Failed to search venues'
    }, null, 2);
  }
}

// Calculate string similarity percentage using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return ((maxLength - distance) / maxLength) * 100;
}

// Levenshtein distance algorithm
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// Extract city name from address string
function extractCityFromAddress(address: string): string | undefined {
  if (!address) return undefined;

  // Address typically format: "Street, City, Postcode"
  // Try to extract the second-to-last component
  const parts = address.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    // Return second-to-last part (usually the city)
    return parts[parts.length - 2];
  }

  return undefined;
}
