// Create Event Tool - MCP Implementation (FIXED)
// Creates an event linking an artist and venue

import { apiRequest, ApiError } from '../utils/http-client.js';
import { normalizeExternalIds } from '../utils/external-ids.js';

interface CreateEventParams {
  artistId?: string; // Single artist (backward compat)
  artistIds?: string[]; // Multiple artists (preferred)
  venueId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24-hour)
  endTime?: string;
  title?: string;
  isPublic?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
  // Enrichment fields (parity with edit_event)
  price?: string; // e.g. "FREE", "£15"
  eventUrl?: string; // Link to source event page
  ticketed?: boolean; // true if ticketed entry
  ticketInformation?: string; // Additional ticket text
  ticketUrl?: string; // Ticket purchase link
  imageUrl?: string; // Poster image URL
  description?: string; // Long-form event description
  notes?: string; // Additional notes
  // Festival fields (Phase 1a - festival-mcp-write-api-spec §2)
  festivalId?: string; // Links event to parent festival
  stageId?: string; // Stage within festival
  billing?: 'headline' | 'special_guest' | 'support' | 'general' | 'opener';
  billingOrder?: number; // Sort order within billing tier
}

interface CreateEventResponse {
  message: string;
  event: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    artistId?: string;
    artistIds?: string[];
    artistNames?: string[];
    venueId: string;
  };
}

export async function createEvent(params: CreateEventParams): Promise<string> {
  const {
    artistId, artistIds, venueId, date, startTime, endTime, title, isPublic, externalIds,
    price, eventUrl, ticketed, ticketInformation, ticketUrl, imageUrl, description, notes,
    festivalId, stageId, billing, billingOrder
  } = params;

  // Build artistIds array from either artistIds or artistId
  const resolvedArtistIds = artistIds || (artistId ? [artistId] : []);

  console.error(`[create_event] Creating event: artists=${resolvedArtistIds.length}, venue=${venueId}, date=${date}`);

  try {
    // Normalize incoming externalIds to strip any doubled prefixes
    const normalizedExternalIds = normalizeExternalIds(externalIds || []);

    // Prepare event data - use artistIds array for multi-artist support
    const eventData: Record<string, unknown> = {
      artistIds: resolvedArtistIds,
      venueId,
      date,
      startTime,
      endTime: endTime || '',
      title: title || undefined,
      isPublic: isPublic !== undefined ? isPublic : false,
      externalIds: normalizedExternalIds,
      source: 'mcp_ai_import',
      // 2026-07-27 AUDIT FIX F7: these flags were previously CLAIMED in the
      // tool's response but never sent — MCP events were invisible to any
      // review queue keyed on them. Sent honestly now.
      ai_created: true,
      needs_review: true
    };

    // Add enrichment fields if provided (parity with edit_event)
    if (price !== undefined) eventData.price = price;
    if (eventUrl !== undefined) eventData.eventUrl = eventUrl;
    if (ticketed !== undefined) eventData.ticketed = ticketed;
    if (ticketInformation !== undefined) eventData.ticketInformation = ticketInformation;
    if (ticketUrl !== undefined) eventData.ticketUrl = ticketUrl;
    if (imageUrl !== undefined) eventData.imageUrl = imageUrl;
    if (description !== undefined) eventData.description = description;
    if (notes !== undefined) eventData.notes = notes;

    // Festival fields (Phase 1a)
    if (festivalId !== undefined) eventData.festivalId = festivalId;
    if (stageId !== undefined) eventData.stageId = stageId;
    if (billing !== undefined) eventData.billing = billing;
    if (billingOrder !== undefined) eventData.billingOrder = billingOrder;

    // Call BNDY events community endpoint (no auth required)
    const response = await apiRequest<CreateEventResponse>('/api/events/community', 'POST', eventData);

    console.error(`[create_event] Successfully created event: ${response.event.id}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      event: {
        id: response.event.id,
        title: response.event.title,
        date: response.event.date,
        startTime: response.event.startTime,
        endTime: endTime || 'Not specified',
        artistId: response.event.artistId,
        artistIds: response.event.artistIds || resolvedArtistIds,
        artistNames: response.event.artistNames || [],
        venueId: response.event.venueId,
        isPublic: isPublic || false,
        source: 'mcp_ai_import',
        // Include enrichment fields in response
        ...(price !== undefined && { price }),
        ...(eventUrl !== undefined && { eventUrl }),
        ...(ticketed !== undefined && { ticketed }),
        ...(ticketInformation !== undefined && { ticketInformation }),
        ...(ticketUrl !== undefined && { ticketUrl }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
        // Festival fields
        ...(festivalId !== undefined && { festivalId }),
        ...(stageId !== undefined && { stageId }),
        ...(billing !== undefined && { billing }),
        ...(billingOrder !== undefined && { billingOrder }),
        aiCreated: true,
        needsReview: true
      },
      message: `Event "${response.event.title}" created successfully on ${date} at ${startTime}.`,
      note: isPublic
        ? 'Event is PUBLIC and will appear on the Frontstage map.'
        : 'Event is PRIVATE (Backstage only).'
    }, null, 2);

  } catch (error: any) {
    console.error(`[create_event] Error:`, error);

    // Check for duplicate event error (409 Conflict).
    // 2026-07-27: ApiError carries the parsed body — no more regex-scraping
    // the message (which usually failed and lost the existing event id).
    if ((error instanceof ApiError && error.isDuplicate) || error.message?.includes('Duplicate')) {
      const errorData = (error instanceof ApiError && error.body) ? error.body : {};
      const existingEventId = errorData.existingEventId || errorData.existingId || null;
      const existingEventTitle = errorData.existingEventTitle || null;
      const matchedExternalId = errorData.matchedExternalId || null;

      const message = matchedExternalId
        ? `Event already exists: Found existing event with externalId ${matchedExternalId.source}:${matchedExternalId.id}. This event was already imported.`
        : `Event already exists: This artist already has an event at this venue on ${date}. Artists can only have one gig per venue per day.`;

      return JSON.stringify({
        success: false,
        error: 'DUPLICATE_EVENT',
        message,
        existingEventId,
        existingEventTitle,
        matchedExternalId,
        action: 'Use edit_event to update the existing event, or use search_event to find it.',
        hint: 'Duplicates are blocked by: (1) externalId match, (2) same artist+venue+date.'
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to create event'
    }, null, 2);
  }
}
