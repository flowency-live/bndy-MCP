// Create Festival Tool - MCP Implementation
// Per spec: festival-mcp-write-api-spec.md §2.1
// A festival groups child events - it is not an event and never appears on the gig map itself.

import { apiRequest } from '../utils/http-client.js';
import { normalizeExternalIds } from '../utils/external-ids.js';

interface Stage {
  name: string;
  venueId?: string;
}

interface LineupSlot {
  displayName: string;
  artistId?: string;
  day?: string; // YYYY-MM-DD
  stageId?: string;
  startTime?: string; // HH:MM
  endTime?: string;
  billing?: 'headline' | 'special_guest' | 'support' | 'general' | 'opener';
  billingOrder?: number;
}

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

interface CreateFestivalParams {
  name: string; // REQUIRED
  startDate: string; // REQUIRED YYYY-MM-DD
  endDate?: string; // defaults to startDate
  description?: string;
  primaryVenueId?: string; // from search_venue/create_venue
  venueIds?: string[];
  stages?: Stage[];
  lineup?: LineupSlot[];
  ticketed?: boolean;
  price?: string;
  ticketUrl?: string;
  lineupUrl?: string;
  websiteUrl?: string;
  posterImageUrl?: string;
  heroImageUrl?: string;
  theme?: Theme;
  isPublic?: boolean; // default false - agents MUST pass true for public festivals
  externalIds?: Array<{ source: string; id: string }>;
}

interface CreateFestivalResponse {
  festivalId: string;
  slug: string;
  message: string;
}

export async function createFestival(params: CreateFestivalParams): Promise<string> {
  const {
    name, startDate, endDate, description, primaryVenueId, venueIds, stages, lineup,
    ticketed, price, ticketUrl, lineupUrl, websiteUrl, posterImageUrl, heroImageUrl,
    theme, isPublic, externalIds
  } = params;

  console.error(`[create_festival] Creating festival: name=${name}, dates=${startDate}${endDate ? '-' + endDate : ''}`);

  // Validation
  if (!name || typeof name !== 'string') {
    return JSON.stringify({
      success: false,
      error: 'name is required',
      message: 'Festival name is required'
    }, null, 2);
  }

  if (!startDate) {
    return JSON.stringify({
      success: false,
      error: 'startDate is required',
      message: 'Festival start date is required (YYYY-MM-DD format)'
    }, null, 2);
  }

  try {
    // Normalize incoming externalIds
    const normalizedExternalIds = normalizeExternalIds(externalIds || []);

    // Prepare festival data
    const festivalData: Record<string, unknown> = {
      name,
      startDate,
      endDate: endDate || startDate,
      description,
      primaryVenueId,
      venueIds: venueIds || [],
      stages: stages || [],
      lineup: lineup || [],
      ticketed,
      price,
      ticketUrl,
      lineupUrl,
      websiteUrl,
      posterImageUrl,
      heroImageUrl,
      theme,
      isPublic: isPublic !== undefined ? isPublic : false,
      externalIds: normalizedExternalIds,
      source: 'mcp_ai_import'
    };

    // Remove undefined values
    Object.keys(festivalData).forEach(key => {
      if (festivalData[key] === undefined) delete festivalData[key];
    });

    // Call festivals endpoint
    const response = await apiRequest<CreateFestivalResponse>('/festivals', 'POST', festivalData);

    console.error(`[create_festival] Success: festivalId=${response.festivalId}, slug=${response.slug}`);

    return JSON.stringify({
      success: true,
      festival: {
        festivalId: response.festivalId,
        slug: response.slug
      },
      message: `Festival "${name}" created successfully`,
      note: 'Search first with search_festival. A festival groups child events - it is not an event and never appears on the gig map itself.'
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[create_festival] Error:`, error);

    // Handle 400 validation errors
    if (errorMessage.includes('400') || errorMessage.includes('validation')) {
      return JSON.stringify({
        success: false,
        error: 'validation_failed',
        message: errorMessage
      }, null, 2);
    }

    // Handle 409 conflict (duplicate)
    if (errorMessage.includes('409') || errorMessage.includes('already exists')) {
      return JSON.stringify({
        success: false,
        error: 'duplicate_festival',
        message: 'A festival with this name/dates may already exist. Use search_festival first.',
        suggestion: 'Use search_festival to find existing festival, then edit_festival to update it'
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to create festival'
    }, null, 2);
  }
}
