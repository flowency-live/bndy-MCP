// Search Event Tool - MCP Implementation
// Searches BNDY events by artistId or venueId with optional date filtering

import { apiRequest, ApiError } from '../utils/http-client.js';

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
  /** DynamoDB stores this attribute snake_case. The public search endpoints spread the
   *  raw item, so ONLY this key is populated there — see the mapping below. */
  external_ids?: Array<{ source: string; id: string }>;
  // Festival fields (Phase 1a)
  festivalId?: string;
  festivalName?: string;
  stageId?: string;
  billing?: string;
  billingOrder?: number;
}

export async function searchEvent(params: SearchEventParams): Promise<string> {
  const { artistId, venueId, festivalId } = params;

  // Validate: require at least artistId, venueId, or festivalId
  if (!artistId && !venueId && !festivalId) {
    return JSON.stringify({
      found: false,
      error: 'artistId, venueId, or festivalId is required',
      message: 'You must provide an artistId, venueId, or festivalId to search for events',
    }, null, 2);
  }

  // Default date window: today to today + 12 months
  // The backend API requires startDate/endDate; omitting them returns 400.
  const today = new Date();
  const yearFromNow = new Date(today);
  yearFromNow.setMonth(yearFromNow.getMonth() + 12);
  const dateFrom = params.dateFrom || today.toISOString().split('T')[0];
  const dateTo = params.dateTo || yearFromNow.toISOString().split('T')[0];

  console.error(`[search_event] Searching events${artistId ? ` for artist: ${artistId}` : ''}${venueId ? ` at venue: ${venueId}` : ''}${festivalId ? ` for festival: ${festivalId}` : ''} (${dateFrom} to ${dateTo})`);

  try {
    // Build date filter query string (always present due to defaults)
    // Public endpoints use startDate/endDate params
    const queryParams: string[] = [];
    queryParams.push(`startDate=${encodeURIComponent(dateFrom)}`);
    queryParams.push(`endDate=${encodeURIComponent(dateTo)}`);
    const queryString = `?${queryParams.join('&')}`;

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
      // ⚠ DO NOT SIMPLIFY TO `event.externalIds || []`.
      // The DynamoDB attribute is `external_ids`. `mcp.js` maps it to camelCase on
      // get/update/delete, but the PUBLIC search endpoints (`/api/artists/:id/public-events`,
      // `/api/venues/:id/events`) spread the raw item, so only `external_ids` is set there.
      // Without this fallback search_event returned `externalIds: []` for EVERY event —
      // not omitted, but present and empty, which reads as authoritative absence.
      // Verified 2026-08-07: event 8afeb616-44c1-462e-aa65-e642e92c7290 read `[]` here and
      // `{lemonrock, 960201-2026-09-20-thewildstrings}` via get_by_id. An agent trusting the
      // empty array would "backfill" provenance, and edit_event REPLACES externalIds (§6B),
      // destroying the real id.
      externalIds: event.externalIds || event.external_ids || [],
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
    console.error(`[search_event] Error:`, error);

    // Surface API error details (e.g., DynamoDB validation errors)
    if (error instanceof ApiError) {
      return JSON.stringify({
        found: false,
        error: error.message,
        status: error.status,
        details: error.body?.details || error.body?.error,
        message: 'Failed to search events',
      }, null, 2);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return JSON.stringify({
      found: false,
      error: errorMessage,
      message: 'Failed to search events',
    }, null, 2);
  }
}
