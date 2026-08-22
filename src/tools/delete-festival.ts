// Delete Festival Tool - MCP Implementation
// Requires festival to have zero child events before deletion.

import { apiRequest, ApiError } from '../utils/http-client.js';

export interface DeleteFestivalParams {
  festivalId: string;
}

interface EventSearchResponse {
  events?: Array<{ id: string }>;
}

export async function deleteFestival(params: DeleteFestivalParams): Promise<string> {
  const { festivalId } = params;

  if (!festivalId) {
    return JSON.stringify({
      success: false,
      error: 'festivalId is required',
      message: 'You must provide a festivalId to delete a festival',
    }, null, 2);
  }

  console.error(`[delete_festival] Checking child events for festival: ${festivalId}`);

  try {
    // Check for child events first - refuse if any exist
    const childEvents = await apiRequest<EventSearchResponse | Array<{ id: string }>>(
      `/api/festivals/${encodeURIComponent(festivalId)}/events`,
      'GET'
    );

    // Handle both array and {events: [...]} response formats
    const events = Array.isArray(childEvents) ? childEvents : (childEvents.events || []);
    const childCount = events.length;

    if (childCount > 0) {
      console.error(`[delete_festival] Refusing: ${childCount} child events exist`);
      return JSON.stringify({
        success: false,
        error: 'FESTIVAL_HAS_CHILDREN',
        childCount,
        message: `Cannot delete festival ${festivalId}: it has ${childCount} child event(s). Delete or reassign the events first.`,
        hint: 'Use search_event({ festivalId }) to list child events, then edit_event to clear their festivalId or delete_event to remove them.',
      }, null, 2);
    }

    console.error(`[delete_festival] No child events, proceeding with delete: ${festivalId}`);

    // Delete the festival - route: DELETE /festivals/{id}
    await apiRequest(`/festivals/${encodeURIComponent(festivalId)}`, 'DELETE');

    console.error(`[delete_festival] Successfully deleted festival: ${festivalId}`);

    return JSON.stringify({
      success: true,
      deletedFestivalId: festivalId,
      message: `Festival ${festivalId} has been permanently removed.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[delete_festival] Error:`, error);

    if (error instanceof ApiError) {
      if (error.status === 404) {
        return JSON.stringify({
          success: false,
          error: 'FESTIVAL_NOT_FOUND',
          message: `Festival ${festivalId} not found.`,
        }, null, 2);
      }
      if (error.status === 403) {
        return JSON.stringify({
          success: false,
          error: 'NOT_PERMITTED',
          message: `Not permitted to delete festival ${festivalId}.`,
        }, null, 2);
      }
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to delete festival',
    }, null, 2);
  }
}
