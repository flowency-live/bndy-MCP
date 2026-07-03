// Edit Festival Tool - MCP Implementation
// Per spec: festival-mcp-write-api-spec.md §2.2

import { apiRequest } from '../utils/http-client.js';
import { normalizeExternalIds } from '../utils/external-ids.js';

interface Stage {
  id?: string;
  name: string;
  venueId?: string;
}

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

interface EditFestivalParams {
  festivalId: string; // REQUIRED
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  primaryVenueId?: string;
  venueIds?: string[];
  stages?: Stage[];
  ticketed?: boolean;
  price?: string;
  ticketUrl?: string;
  lineupUrl?: string;
  websiteUrl?: string;
  posterImageUrl?: string;
  heroImageUrl?: string;
  theme?: Theme;
  isPublic?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
  replaceExternalIds?: boolean; // Default false (additive merge)
}

export async function editFestival(params: EditFestivalParams): Promise<string> {
  const { festivalId, externalIds, replaceExternalIds, ...updateFields } = params;

  console.error(`[edit_festival] Updating festival: ${festivalId}`);

  if (!festivalId) {
    return JSON.stringify({
      success: false,
      error: 'festivalId is required',
      message: 'Festival ID is required for update'
    }, null, 2);
  }

  try {
    // Build update payload
    const updateData: Record<string, unknown> = { ...updateFields };

    // Handle externalIds merge
    if (externalIds && externalIds.length > 0) {
      updateData.externalIds = normalizeExternalIds(externalIds);
      if (replaceExternalIds) {
        updateData.replaceExternalIds = true;
      }
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    if (Object.keys(updateData).length === 0) {
      return JSON.stringify({
        success: false,
        error: 'no_fields_to_update',
        message: 'No fields provided to update'
      }, null, 2);
    }

    // Call PATCH endpoint
    const response = await apiRequest<{ festival: unknown; message: string }>(
      `/festivals/${festivalId}`,
      'PATCH',
      updateData
    );

    console.error(`[edit_festival] Success: ${festivalId}`);

    return JSON.stringify({
      success: true,
      festival: response.festival,
      message: response.message || 'Festival updated successfully',
      note: 'Slug is immutable and cannot be modified via this tool.'
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[edit_festival] Error:`, error);

    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'festival_not_found',
        message: `Festival ${festivalId} not found`
      }, null, 2);
    }

    if (errorMessage.includes('slug') && errorMessage.includes('immutable')) {
      return JSON.stringify({
        success: false,
        error: 'slug_immutable',
        message: 'Slug cannot be modified after festival creation'
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to update festival'
    }, null, 2);
  }
}
