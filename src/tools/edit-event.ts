// Edit Event Tool - MCP Implementation
// Updates an existing event in BNDY via PUT /api/events/:id/mcp
// Uses MCP-specific endpoint that doesn't require authentication

import { apiRequest } from '../utils/http-client.js';
import { mergeExternalIds, normalizeExternalIds, ExternalId } from '../utils/external-ids.js';

export interface EditEventParams {
  eventId: string;
  artistId?: string; // Change event artist (for merging duplicates)
  venueId?: string; // Change event venue
  title?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  description?: string;
  ticketed?: boolean;
  ticketUrl?: string;
  ticketInformation?: string;
  price?: string;
  imageUrl?: string; // Event poster URL
  eventUrl?: string; // External event page URL
  notes?: string;
  isPublic?: boolean; // Whether event appears on public Frontstage map
  externalIds?: Array<{ source: string; id: string }>; // External system references
  replaceExternalIds?: boolean; // If true, replace all externalIds instead of merge
  // Festival fields (Phase 1a - festival-mcp-write-api-spec §2)
  festivalId?: string; // Links event to parent festival
  festivalName?: string; // Denormalized festival name for display
  stageId?: string; // Stage within festival
  billing?: 'headline' | 'special_guest' | 'support' | 'general' | 'opener';
  billingOrder?: number; // Sort order within billing tier
}

interface EditEventResponse {
  id: string;
  venueId?: string;
  venueName?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  ticketed?: boolean;
  ticketUrl?: string;
  ticketinformation?: string;
  price?: string;
  imageUrl?: string;
  eventUrl?: string;
  notes?: string;
  isPublic?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
}

export async function editEvent(params: EditEventParams): Promise<string> {
  const { eventId, ...updateData } = params;

  // Validate required field
  if (!eventId) {
    return JSON.stringify({
      success: false,
      error: 'eventId is required',
      message: 'You must provide an eventId to edit an event',
    }, null, 2);
  }

  console.error(`[edit_event] Updating event: ${eventId}`);

  try {
    // Build update payload - only include fields that were provided
    const updatePayload: Record<string, unknown> = {};

    if (updateData.artistId !== undefined) updatePayload.artist_id = updateData.artistId;
    if (updateData.venueId !== undefined) updatePayload.venueId = updateData.venueId;
    if (updateData.title !== undefined) updatePayload.title = updateData.title;
    if (updateData.date !== undefined) updatePayload.date = updateData.date;
    if (updateData.startTime !== undefined) updatePayload.startTime = updateData.startTime;
    if (updateData.endTime !== undefined) updatePayload.endTime = updateData.endTime;
    if (updateData.description !== undefined) updatePayload.description = updateData.description;
    if (updateData.ticketed !== undefined) updatePayload.ticketed = updateData.ticketed;
    if (updateData.ticketUrl !== undefined) updatePayload.ticketUrl = updateData.ticketUrl;
    if (updateData.ticketInformation !== undefined) updatePayload.ticketinformation = updateData.ticketInformation;
    if (updateData.price !== undefined) updatePayload.price = updateData.price;
    if (updateData.imageUrl !== undefined) updatePayload.imageUrl = updateData.imageUrl;
    if (updateData.eventUrl !== undefined) updatePayload.eventUrl = updateData.eventUrl;
    if (updateData.notes !== undefined) updatePayload.notes = updateData.notes;
    if (updateData.isPublic !== undefined) updatePayload.isPublic = updateData.isPublic;
    // Festival fields (Phase 1a)
    if (updateData.festivalId !== undefined) updatePayload.festivalId = updateData.festivalId;
    if (updateData.festivalName !== undefined) updatePayload.festivalName = updateData.festivalName;
    if (updateData.stageId !== undefined) updatePayload.stageId = updateData.stageId;
    if (updateData.billing !== undefined) updatePayload.billing = updateData.billing;
    if (updateData.billingOrder !== undefined) updatePayload.billingOrder = updateData.billingOrder;

    // Handle externalIds with merge logic
    if (updateData.externalIds !== undefined) {
      // Normalize incoming externalIds to strip any doubled prefixes
      const normalizedIncoming = normalizeExternalIds(updateData.externalIds);

      if (updateData.replaceExternalIds) {
        // Full replacement mode
        updatePayload.externalIds = normalizedIncoming;
      } else {
        // Additive merge mode (default): fetch current via MCP endpoint (no auth), merge, send merged
        const currentEvent = await apiRequest<EditEventResponse>(`/api/events/${eventId}/mcp`, 'GET');
        const existingIds: ExternalId[] = currentEvent.externalIds || [];
        updatePayload.externalIds = mergeExternalIds(existingIds, normalizedIncoming);
      }
    }

    // Call BNDY events MCP endpoint (no auth required)
    const response = await apiRequest<EditEventResponse>(
      `/api/events/${eventId}/mcp`,
      'PUT',
      updatePayload
    );

    console.error(`[edit_event] Successfully updated event: ${response.id}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      event: {
        id: response.id,
        venueId: response.venueId,
        venueName: response.venueName,
        title: response.title,
        date: response.date,
        startTime: response.startTime,
        endTime: response.endTime,
        description: response.description,
        ticketed: response.ticketed,
        ticketUrl: response.ticketUrl,
        ticketInformation: response.ticketinformation,
        price: response.price,
        imageUrl: response.imageUrl,
        eventUrl: response.eventUrl,
        notes: response.notes,
        isPublic: response.isPublic,
        externalIds: response.externalIds || [],
      },
      message: `Event "${response.title}" updated successfully.`,
      updatedFields: Object.keys(updatePayload),
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[edit_event] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to update event',
    }, null, 2);
  }
}
