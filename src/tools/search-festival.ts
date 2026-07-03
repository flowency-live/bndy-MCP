// Search Festival Tool - MCP Implementation
// Per spec: festival-mcp-write-api-spec.md §2.3
// Returns ALL matches - not top-match-only (learned from search_venue hiding dup venues)

import { apiRequest } from '../utils/http-client.js';

interface SearchFestivalParams {
  name: string;
  town?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}

interface FestivalSummary {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  town?: string;
  venueIds?: string[];
  actCount?: number;
}

interface SearchResponse {
  festivals: FestivalSummary[];
}

export async function searchFestival(params: SearchFestivalParams): Promise<string> {
  const { name, town, dateFrom, dateTo } = params;

  console.error(`[search_festival] Searching: name=${name}, town=${town || 'any'}`);

  if (!name) {
    return JSON.stringify({
      success: false,
      error: 'name is required',
      message: 'Festival name is required for search'
    }, null, 2);
  }

  try {
    // Build query params
    const queryParams = new URLSearchParams();
    queryParams.set('name', name);
    if (town) queryParams.set('town', town);
    if (dateFrom) queryParams.set('dateFrom', dateFrom);
    if (dateTo) queryParams.set('dateTo', dateTo);

    const response = await apiRequest<SearchResponse>(`/festivals?${queryParams.toString()}`);

    const festivals = response.festivals || [];

    console.error(`[search_festival] Found ${festivals.length} matches`);

    if (festivals.length === 0) {
      return JSON.stringify({
        success: true,
        festivals: [],
        message: `No festivals found matching "${name}"`,
        note: 'If this is a new festival, use create_festival. Remember: same/near name + same town + overlapping dates = same festival; reuse it.'
      }, null, 2);
    }

    // Return ALL matches with dedup guidance
    return JSON.stringify({
      success: true,
      festivals: festivals.map(f => ({
        festivalId: f.id,
        slug: f.slug,
        name: f.name,
        startDate: f.startDate,
        endDate: f.endDate,
        town: f.town,
        venueCount: f.venueIds?.length || 0,
        actCount: f.actCount || 0
      })),
      count: festivals.length,
      message: `Found ${festivals.length} festival(s) matching "${name}"`,
      dedupRule: 'Same/near name + same town + overlapping dates = same festival; reuse the existing one via edit_festival instead of creating a duplicate.'
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search_festival] Error:`, error);

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to search festivals'
    }, null, 2);
  }
}
