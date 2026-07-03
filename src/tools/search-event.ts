// Search Event Tool - MCP Implementation
// Searches BNDY events by artistId or venueId with optional date filtering

import { apiRequest } from '../utils/http-client.js';

export interface SearchEventParams {
  artistId?: string;
  venueId?: string;
  festivalId?: string; // Filter by parent festival (Phase 1a)
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}

interface EventResult {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  artistId: string;
  artistName?: string;
  venueId: string;
  venueName?: string;
  venueCity?: string;
  externalIds?: Array<{ source: string; id: string }>;
  // Festival fields (Phase 1a)
  festivalId?: string;
  festivalName?: string;
  stageId?: string;
  billing?: string;
  billingOrder?: number;
}

export async function searchEvent(params: SearchEventParams): Promise<string> {
  const { artistId, venueId, festivalId, dateFrom, dateTo } = params;

  // Validate: require at least artistId, venueId, or festivalId
  if (!artistId && !venueId && !festivalId) {
    return JSON.stringify({
      found: false,
      error: 'artistId, venueId, or festivalId is required',
      message: 'You must provide an artistId, venueId, or festivalId to search for events',
    }, null, 2);
  }

  console.error(`[search_event] Searching events${artistId ? ` for artist: ${artistId}` : ''}${venueId ? ` at venue: ${venueId}` : ''}${festivalId ? ` for festival: ${festivalId}` : ''}`);

  try {
    // Build optional date filter query string
    // Public endpoints use startDate/endDate params
    const queryParams: string[] = [];
    if (dateFrom) queryParams.push(`startDate=${encodeURIComponent(dateFrom)}`);
    if (dateTo) queryParams.push(`endDate=${encodeURIComponent(dateTo)}`);
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    // Use public endpoints (no auth required)
    let searchUrl: string;
    if (festivalId) {
      // Festival child events endpoint (byFestival GSI)
      searchUrl = `/api/festivals/${encodeURIComponent(festivalId)}/events${queryString}`;
    } else if (artistId) {
      searchUrl = `/api/artists/${encodeURIComponent(artistId)}/public-events${queryString}`;
    } else {
      searchUrl = `/api/venues/${encodeURIComponent(venueId!)}/events${queryString}`;
    }

    // Artist endpoint returns {events: [...]}, venue endpoint returns array directly
    const response = await apiRequest<EventResult[] | { events: EventResult[] }>(searchUrl, 'GET');
    const events = Array.isArray(response) ? response : response.events;

    console.error(`[search_event] API returned ${events.length} events`);

    if (events.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No events found${artistId ? ` for artist ${artistId}` : ''}${venueId ? ` at venue ${venueId}` : ''}`,
        searchCriteria: { artistId, venueId, dateFrom, dateTo },
      }, null, 2);
    }

    // Transform results
    const results = events.map(event => ({
      id: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      artistId: event.artistId,
      artistName: event.artistName,
      venueId: event.venueId,
      venueName: event.venueName,
      venueCity: event.venueCity,
      externalIds: event.externalIds || [],
      // Festival fields (Phase 1a)
      ...(event.festivalId && { festivalId: event.festivalId }),
      ...(event.festivalName && { festivalName: event.festivalName }),
      ...(event.stageId && { stageId: event.stageId }),
      ...(event.billing && { billing: event.billing }),
      ...(event.billingOrder !== undefined && { billingOrder: event.billingOrder }),
    }));

    // Sort by date
    results.sort((a, b) => a.date.localeCompare(b.date));

    return JSON.stringify({
      found: true,
      count: results.length,
      events: results,
      message: `Found ${results.length} event(s)`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search_event] Error:`, error);
    return JSON.stringify({
      found: false,
      error: errorMessage,
      message: 'Failed to search events',
    }, null, 2);
  }
}
