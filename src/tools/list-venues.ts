// List Venues Tool - MCP Implementation
// Paginated list of venues with optional filters for missing data

import { apiRequest } from '../utils/http-client.js';

export interface ListVenuesParams {
  limit?: number;           // Max records (default 100, max 500)
  offset?: number;          // Skip records for pagination
  missingSocials?: boolean; // Filter to venues with no website/social media
  missingAddress?: boolean; // Filter to venues with no address
  missingCity?: boolean;    // Filter to venues with no city
  missingCoordinates?: boolean; // Filter to venues with no lat/lng
  region?: string;          // Filter by address/city containing this string
  city?: string;            // Filter by exact city match
  createdSince?: string;    // Filter by createdAt >= this ISO date
  aiCreated?: boolean;      // Filter by AI-created status
}

interface Venue {
  id: string;
  name: string;
  address?: string;
  city?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  phone?: string;
  socialMediaUrls?: Array<{ platform: string; url: string }>;
  facilities?: string[];
  profileImageUrl?: string;
  standardTicketed?: boolean;
  standardTicketInformation?: string;
  standardTicketUrl?: string;
  externalIds?: Array<{ source: string; id: string }>;
  isClaimed?: boolean;
  aiCreated?: boolean;
  needsReview?: boolean;
  createdSource?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ListVenuesResponse {
  venues: Venue[];
  pagination: {
    count: number;
    returned: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

export async function listVenues(params: ListVenuesParams): Promise<string> {
  console.error(`[list_venues] Listing venues with params:`, JSON.stringify(params));

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
    if (params.missingAddress) {
      queryParams.set('missingAddress', 'true');
    }
    if (params.missingCity) {
      queryParams.set('missingCity', 'true');
    }
    if (params.missingCoordinates) {
      queryParams.set('missingCoordinates', 'true');
    }
    if (params.region) {
      queryParams.set('region', params.region);
    }
    if (params.city) {
      queryParams.set('city', params.city);
    }
    if (params.createdSince) {
      queryParams.set('createdSince', params.createdSince);
    }
    if (params.aiCreated !== undefined) {
      queryParams.set('aiCreated', String(params.aiCreated));
    }

    const queryString = queryParams.toString();
    const path = `/api/venues/list${queryString ? `?${queryString}` : ''}`;

    const response = await apiRequest<ListVenuesResponse>(path, 'GET');

    console.error(`[list_venues] Retrieved ${response.pagination.returned} of ${response.pagination.count} venues`);

    return JSON.stringify({
      success: true,
      venues: response.venues,
      pagination: response.pagination,
      message: `Found ${response.pagination.count} venues matching filters. Returned ${response.pagination.returned} (offset: ${response.pagination.offset}, limit: ${response.pagination.limit}).`
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[list_venues] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to list venues'
    }, null, 2);
  }
}
