// Delete Event Tool - MCP Implementation
// Permanently removes an event from BNDY
// WORKAROUND: Backend has no DELETE /api/events/:id/mcp endpoint, so we:
// 1. GET /api/events/:id/mcp to fetch artistIds
// 2. DELETE /api/artists/:artistId/events/:id using first artistId

import { apiRequest } from '../utils/http-client.js';

export interface DeleteEventParams {
  eventId: string;
}

interface EventDetailsResponse {
  id: string;
  artistIds?: string[];
  artistId?: string;
  title: string;
}

interface DeleteEventResponse {
  message: string;
}

export async function deleteEvent(params: DeleteEventParams): Promise<string> {
  const { eventId } = params;

  // Validate required field
  if (!eventId) {
    return JSON.stringify({
      success: false,
      error: 'eventId is required',
      message: 'You must provide an eventId to delete an event',
    }, null, 2);
  }

  console.error(`[delete_event] Deleting event: ${eventId}`);

  try {
    // Step 1: GET event details to retrieve artistId(s)
    console.error(`[delete_event] Fetching event details to get artistId...`);
    const eventDetails = await apiRequest<EventDetailsResponse>(
      `/api/events/${eventId}/mcp`,
      'GET'
    );

    // Extract artistId (prefer artistIds array, fallback to artistId field)
    const artistId = (eventDetails.artistIds && eventDetails.artistIds.length > 0)
      ? eventDetails.artistIds[0]
      : eventDetails.artistId;

    if (!artistId) {
      return JSON.stringify({
        success: false,
        error: 'NO_ARTIST_ID',
        message: `Event ${eventId} has no associated artist. Cannot delete via MCP.`,
      }, null, 2);
    }

    console.error(`[delete_event] Found artistId: ${artistId}, proceeding with deletion...`);

    // Step 2: DELETE using artist-scoped endpoint
    // Backend route: DELETE /api/artists/:artistId/events/:id
    const response = await apiRequest<DeleteEventResponse>(
      `/api/artists/${artistId}/events/${eventId}`,
      'DELETE'
    );

    console.error(`[delete_event] Successfully deleted event: ${eventId}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      deletedEventId: eventId,
      artistId,
      message: response.message || `Event "${eventDetails.title}" has been permanently removed.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[delete_event] Error:`, error);

    // Check if it's a 404 (event not found)
    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: `Event ${eventId} not found. It may have already been deleted or you may not have permission to delete it.`,
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to delete event',
    }, null, 2);
  }
}
