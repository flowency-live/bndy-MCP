// Delete Event Tool - MCP Implementation
// Calls the unauthenticated DELETE /api/events/:id/mcp route (bndy-serverless-api BUILD-008 G1).
// Previously this used a 401-prone workaround (GET event -> DELETE /api/artists/:artistId/events/:id),
// because that authed route sits behind requireAuth and the MCP has no token. The /mcp delete route
// fixes that. Safety: the backend only deletes SOURCE-IMPORTED events (those with external_ids);
// app/human-created gigs return 403 and must be deleted via Backstage.

import { apiRequest } from '../utils/http-client.js';

export interface DeleteEventParams {
  eventId: string;
}

interface DeleteEventResponse {
  message: string;
  id?: string;
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

  console.error(`[delete_event] Deleting event via /mcp: ${eventId}`);

  try {
    const response = await apiRequest<DeleteEventResponse>(
      `/api/events/${eventId}/mcp`,
      'DELETE'
    );

    console.error(`[delete_event] Successfully deleted event: ${eventId}`);

    return JSON.stringify({
      success: true,
      deletedEventId: eventId,
      message: response.message || `Event ${eventId} has been permanently removed.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[delete_event] Error:`, error);

    // 403: backend refused because the event is not source-imported (no external_ids)
    if (errorMessage.includes('403')) {
      return JSON.stringify({
        success: false,
        error: 'NOT_SOURCE_IMPORTED',
        message: `Event ${eventId} is not source-imported (no external_ids). MCP delete is restricted to source-imported events; delete app/human-created gigs via Backstage.`,
      }, null, 2);
    }

    // 404: event missing, OR the DELETE /api/events/:id/mcp route isn't deployed yet (G1).
    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: `Event ${eventId} not found (or the DELETE /api/events/:id/mcp route is not yet deployed - bndy-serverless-api BUILD-008 G1).`,
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to delete event',
    }, null, 2);
  }
}
