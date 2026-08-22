// Venue Group Tools - MCP Implementation
// Feature 19: venue ownership groups (Robinsons, Amber Taverns, etc.)
//
// list_venue_groups  - GET /api/venue-groups
// create_venue_group - POST /api/venue-groups (idempotent via 409)
//
// edit_venue with ownerGroupId is the assignment path - no separate tool.

import { apiRequest, ApiError } from '../utils/http-client.js';

/** The groupType enum. A brewery tied house differs from a pubco freehold. */
const GROUP_TYPES = ['brewery', 'pubco', 'chain', 'operator'] as const;
type GroupType = typeof GROUP_TYPES[number];

interface VenueGroup {
  id: string;
  slug: string;
  name: string;
  groupType: GroupType;
  venueCount?: number;
  website?: string;
  facebookUrl?: string;
  bio?: string;
}

interface ListGroupsResponse {
  groups: VenueGroup[];
}

interface CreateGroupResponse {
  group: VenueGroup;
}

export interface CreateVenueGroupParams {
  name: string;
  groupType: GroupType;
  website?: string;
  facebookUrl?: string;
  bio?: string;
}

/**
 * List every venue ownership group in BNDY.
 * Call this BEFORE create_venue_group to avoid a duplicate.
 */
export async function listVenueGroups(): Promise<string> {
  console.error('[list_venue_groups] Fetching all venue groups');

  try {
    const response = await apiRequest<ListGroupsResponse>('/api/venue-groups', 'GET');
    const groups = response.groups || [];

    console.error(`[list_venue_groups] Found ${groups.length} groups`);

    return JSON.stringify({
      success: true,
      groups: groups.map(g => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        groupType: g.groupType,
        venueCount: g.venueCount ?? 0,
      })),
      message: `Found ${groups.length} venue groups.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[list_venue_groups] Error:', error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to list venue groups',
    }, null, 2);
  }
}

/**
 * Create a venue ownership group. A venue has ONE owner group.
 * Robinsons Brewery is a brewery. Amber Taverns is a pubco.
 *
 * Idempotent: if a group with that name exists, returns it with isNew=false.
 */
export async function createVenueGroup(params: CreateVenueGroupParams): Promise<string> {
  const { name, groupType, website, facebookUrl, bio } = params;

  // Validate required fields
  if (!name || !String(name).trim()) {
    return JSON.stringify({
      success: false,
      error: 'name is required',
      message: 'Provide a group name (e.g., "Robinsons Brewery")',
    }, null, 2);
  }

  if (!groupType) {
    return JSON.stringify({
      success: false,
      error: 'groupType is required',
      message: `Provide a groupType: ${GROUP_TYPES.join(', ')}`,
    }, null, 2);
  }

  if (!GROUP_TYPES.includes(groupType)) {
    return JSON.stringify({
      success: false,
      error: `groupType must be one of: ${GROUP_TYPES.join(', ')}`,
      message: `Invalid groupType "${groupType}". Use: brewery, pubco, chain, or operator.`,
    }, null, 2);
  }

  console.error(`[create_venue_group] Creating group: ${name} (${groupType})`);

  try {
    const payload: Record<string, string> = {
      name: String(name).trim(),
      groupType,
    };
    if (website) payload.website = website;
    if (facebookUrl) payload.facebookUrl = facebookUrl;
    if (bio) payload.bio = bio;

    const response = await apiRequest<CreateGroupResponse>('/api/venue-groups', 'POST', payload);

    console.error(`[create_venue_group] Created: ${response.group.id} (${response.group.slug})`);

    return JSON.stringify({
      success: true,
      isNew: true,
      groupId: response.group.id,
      group: {
        id: response.group.id,
        slug: response.group.slug,
        name: response.group.name,
        groupType: response.group.groupType,
      },
      message: `Created venue group "${response.group.name}".`,
    }, null, 2);

  } catch (error: unknown) {
    // Handle 409 duplicate - return existing group as success
    if (error instanceof ApiError && error.isDuplicate) {
      const existingId = error.body?.existingId;
      console.error(`[create_venue_group] Duplicate - existing group: ${existingId}`);
      return JSON.stringify({
        success: true,
        isNew: false,
        groupId: existingId,
        message: `Group "${name}" already exists (id: ${existingId}).`,
      }, null, 2);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[create_venue_group] Error:', error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to create venue group',
    }, null, 2);
  }
}
