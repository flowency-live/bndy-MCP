// Delete Venue Tool - MCP Implementation
// Calls DELETE /api/venues/:id/mcp (requires backend route to be deployed)
// Safety: backend should only allow deletion of AI-created/source-imported venues

import { apiRequest } from '../utils/http-client.js';

export interface DeleteVenueParams {
  venueId: string;
}

interface DeleteVenueResponse {
  message: string;
  id?: string;
}

export async function deleteVenue(params: DeleteVenueParams): Promise<string> {
  const { venueId } = params;

  if (!venueId) {
    return JSON.stringify({
      success: false,
      error: 'venueId is required',
      message: 'You must provide a venueId to delete a venue',
    }, null, 2);
  }

  console.error(`[delete_venue] Deleting venue via /mcp: ${venueId}`);

  try {
    const response = await apiRequest<DeleteVenueResponse>(
      `/api/venues/${venueId}/mcp`,
      'DELETE'
    );

    console.error(`[delete_venue] Successfully deleted venue: ${venueId}`);

    return JSON.stringify({
      success: true,
      deletedVenueId: venueId,
      message: response.message || `Venue ${venueId} has been permanently removed.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[delete_venue] Error:`, error);

    if (errorMessage.includes('403')) {
      return JSON.stringify({
        success: false,
        error: 'NOT_SOURCE_IMPORTED',
        message: `Venue ${venueId} is not source-imported. MCP delete is restricted to AI-created/source-imported venues.`,
      }, null, 2);
    }

    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'VENUE_NOT_FOUND',
        message: `Venue ${venueId} not found (or DELETE /api/venues/:id/mcp route not deployed yet).`,
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to delete venue',
    }, null, 2);
  }
}
