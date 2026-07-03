// Resolve Lineup Slot Tool - MCP Implementation
// Per spec: festival-mcp-write-api-spec.md §2.5
// Incremental hardening: crawl finds set times → create child event → resolve slot with both ids

import { apiRequest } from '../utils/http-client.js';

interface ResolveLineupSlotParams {
  festivalId: string; // REQUIRED
  slotId: string; // REQUIRED
  artistId?: string; // Set when artist is resolved
  eventId?: string; // Set when child event exists
  remove?: boolean; // true to remove act from bill (dropped from lineup)
}

interface ResolveSlotResponse {
  slot: {
    id: string;
    displayName: string;
    artistId?: string;
    eventId?: string;
    resolved: boolean;
  };
  message: string;
}

export async function resolveLineupSlot(params: ResolveLineupSlotParams): Promise<string> {
  const { festivalId, slotId, artistId, eventId, remove } = params;

  console.error(`[resolve_lineup_slot] Resolving slot: festival=${festivalId}, slot=${slotId}, remove=${remove || false}`);

  if (!festivalId) {
    return JSON.stringify({
      success: false,
      error: 'festivalId is required',
      message: 'Festival ID is required'
    }, null, 2);
  }

  if (!slotId) {
    return JSON.stringify({
      success: false,
      error: 'slotId is required',
      message: 'Slot ID is required'
    }, null, 2);
  }

  try {
    const updateData: Record<string, unknown> = {};

    if (remove === true) {
      updateData.removeSlotId = slotId;
    } else {
      updateData.resolveSlot = {
        slotId,
        artistId,
        eventId
      };
    }

    const response = await apiRequest<ResolveSlotResponse>(
      `/festivals/${festivalId}`,
      'PATCH',
      updateData
    );

    const slot = response.slot;
    console.error(`[resolve_lineup_slot] Success: slot ${slotId} ${remove ? 'removed' : 'resolved'}`);

    if (remove) {
      return JSON.stringify({
        success: true,
        message: `Lineup slot removed from festival (act dropped from bill)`,
        slotId
      }, null, 2);
    }

    return JSON.stringify({
      success: true,
      slot: {
        slotId: slot.id,
        displayName: slot.displayName,
        artistId: slot.artistId,
        eventId: slot.eventId,
        resolved: slot.resolved
      },
      message: `Lineup slot ${slot.resolved ? 'fully resolved' : 'partially resolved'}`,
      note: slot.resolved
        ? 'Slot now has both artistId and eventId - fully linked'
        : 'Slot partially resolved. Add artistId to link artist, add eventId when child event is created.'
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[resolve_lineup_slot] Error:`, error);

    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'not_found',
        message: `Festival ${festivalId} or slot ${slotId} not found`
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to resolve lineup slot'
    }, null, 2);
  }
}
