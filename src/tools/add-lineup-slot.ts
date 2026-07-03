// Add Lineup Slot Tool - MCP Implementation
// Per spec: festival-mcp-write-api-spec.md §2.4
// Batch add lineup slots - always import a bill in ONE call

import { apiRequest } from '../utils/http-client.js';

interface LineupSlotInput {
  displayName: string; // REQUIRED, as billed
  artistId?: string; // if already resolved
  day?: string; // YYYY-MM-DD
  stageId?: string;
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  billing?: 'headline' | 'special_guest' | 'support' | 'general' | 'opener';
  billingOrder?: number;
}

interface AddLineupSlotParams {
  festivalId: string; // REQUIRED
  slots: LineupSlotInput[]; // batch - always import a bill in ONE call
}

interface SlotResponse {
  id: string;
  displayName: string;
}

interface AddLineupSlotResponse {
  slots: SlotResponse[];
  message: string;
}

export async function addLineupSlot(params: AddLineupSlotParams): Promise<string> {
  const { festivalId, slots } = params;

  console.error(`[add_lineup_slot] Adding ${slots?.length || 0} slots to festival: ${festivalId}`);

  if (!festivalId) {
    return JSON.stringify({
      success: false,
      error: 'festivalId is required',
      message: 'Festival ID is required'
    }, null, 2);
  }

  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return JSON.stringify({
      success: false,
      error: 'slots array is required',
      message: 'At least one lineup slot is required'
    }, null, 2);
  }

  // Validate each slot
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot.displayName) {
      return JSON.stringify({
        success: false,
        error: 'displayName required',
        message: `Slot at index ${i} is missing displayName`
      }, null, 2);
    }

    if (slot.billing && !['headline', 'special_guest', 'support', 'general', 'opener'].includes(slot.billing)) {
      return JSON.stringify({
        success: false,
        error: 'invalid billing tier',
        message: `Slot "${slot.displayName}" has invalid billing: ${slot.billing}. Must be: headline, special_guest, support, general, or opener`
      }, null, 2);
    }

    if (slot.billingOrder !== undefined && (typeof slot.billingOrder !== 'number' || slot.billingOrder < 0)) {
      return JSON.stringify({
        success: false,
        error: 'invalid billingOrder',
        message: `Slot "${slot.displayName}" has invalid billingOrder: must be a non-negative number`
      }, null, 2);
    }
  }

  try {
    // PATCH the festival with new lineup slots
    const response = await apiRequest<AddLineupSlotResponse>(
      `/festivals/${festivalId}`,
      'PATCH',
      {
        addLineupSlots: slots // Server handles slot dedup on (displayName lowercased, day, stageId)
      }
    );

    const addedSlots = response.slots || [];
    console.error(`[add_lineup_slot] Success: ${addedSlots.length} slots added/updated`);

    return JSON.stringify({
      success: true,
      slots: addedSlots.map(s => ({
        slotId: s.id,
        displayName: s.displayName
      })),
      count: addedSlots.length,
      message: `Added ${addedSlots.length} lineup slot(s) to festival`,
      note: 'Server dedups within festival on (displayName lowercased, day, stageId) - re-running import does not double the bill.'
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[add_lineup_slot] Error:`, error);

    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'festival_not_found',
        message: `Festival ${festivalId} not found`
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to add lineup slots'
    }, null, 2);
  }
}
