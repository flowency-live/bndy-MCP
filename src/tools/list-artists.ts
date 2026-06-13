// List Artists Tool - MCP Implementation
// Paginated list of artists with optional filters for missing data

import { apiRequest } from '../utils/http-client.js';

export interface ListArtistsParams {
  limit?: number;          // Max records (default 100, max 500)
  offset?: number;         // Skip records for pagination
  missingSocials?: boolean; // Filter to artists with no Facebook/Instagram/website
  missingLocation?: boolean; // Filter to artists with no location
  missingGenres?: boolean;  // Filter to artists with no genres
  region?: string;          // Filter by location containing this string
  createdSince?: string;    // Filter by createdAt >= this ISO date
}

interface Artist {
  id: string;
  name: string;
  artistType?: string;
  bio?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  locationType?: string;
  genres?: string[];
  actType?: string[];
  acoustic?: boolean;
  facebookUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  twitterUrl?: string;
  profileImageUrl?: string;
  externalIds?: Array<{ source: string; id: string }>;
  isVerified?: boolean;
  isClaimed?: boolean;
  source?: string;
  aiCreated?: boolean;
  needsReview?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ListArtistsResponse {
  artists: Artist[];
  pagination: {
    count: number;
    returned: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

export async function listArtists(params: ListArtistsParams): Promise<string> {
  console.error(`[list_artists] Listing artists with params:`, JSON.stringify(params));

  try {
    // Build query string
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) {
      queryParams.set('limit', String(Math.min(params.limit, 500)));
    }
    if (params.offset !== undefined) {
      queryParams.set('offset', String(params.offset));
    }
    if (params.missingSocials) {
      queryParams.set('missingSocials', 'true');
    }
    if (params.missingLocation) {
      queryParams.set('missingLocation', 'true');
    }
    if (params.missingGenres) {
      queryParams.set('missingGenres', 'true');
    }
    if (params.region) {
      queryParams.set('region', params.region);
    }
    if (params.createdSince) {
      queryParams.set('createdSince', params.createdSince);
    }

    const queryString = queryParams.toString();
    const path = `/api/artists/list${queryString ? `?${queryString}` : ''}`;

    const response = await apiRequest<ListArtistsResponse>(path, 'GET');

    console.error(`[list_artists] Retrieved ${response.pagination.returned} of ${response.pagination.count} artists`);

    return JSON.stringify({
      success: true,
      artists: response.artists,
      pagination: response.pagination,
      message: `Found ${response.pagination.count} artists matching filters. Returned ${response.pagination.returned} (offset: ${response.pagination.offset}, limit: ${response.pagination.limit}).`
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[list_artists] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to list artists'
    }, null, 2);
  }
}
