// Edit Venue Tool - MCP Implementation
// Updates an existing venue in BNDY via PUT /api/venues/:id/mcp
// Uses MCP-specific endpoint that doesn't require authentication

import { apiRequest } from '../utils/http-client.js';
import { mergeExternalIds, normalizeExternalIds, ExternalId } from '../utils/external-ids.js';

interface SocialMediaUrl {
  platform: 'website' | 'facebook' | 'instagram' | 'youtube' | 'x' | 'spotify';
  url: string;
}

/** The tenure enum. Feature 19: who owns the bricks. */
const TENURES = ['unknown', 'independent', 'owned'] as const;
type Tenure = typeof TENURES[number];

export interface EditVenueParams {
  venueId: string;
  name?: string;
  address?: string;
  city?: string;
  nameVariants?: string[]; // Alternative names / aliases
  postcode?: string;
  phone?: string;
  website?: string;
  socialMediaUrls?: SocialMediaUrl[];
  facebookUrl?: string;
  instagramUrl?: string;
  description?: string;
  facilities?: string[];
  profileImageUrl?: string;
  standardTicketed?: boolean;
  standardTicketUrl?: string;
  standardTicketInformation?: string;
  validated?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
  replaceExternalIds?: boolean;
  // Feature 19: venue ownership groups
  ownerGroupId?: string;
  tenure?: Tenure;
}

/** What `PUT /api/venues/:id/group` returns. */
interface GroupWriteResult {
  venueId: string;
  ownerGroupId: string | null;
  ownerGroupName?: string;
  tenure: Tenure;
}

interface EditVenueResponse {
  id: string;
  name: string;
  address: string;
  city?: string;
  nameVariants?: string[];
  postcode?: string;
  phone?: string;
  website?: string;
  social_media_urls?: SocialMediaUrl[];
  facilities?: string[];
  profile_image_url?: string;
  standard_ticketed?: boolean;
  standard_ticket_url?: string;
  standard_ticket_information?: string;
  validated?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
}

export async function editVenue(params: EditVenueParams): Promise<string> {
  const { venueId, ...updateData } = params;

  // Validate required field
  if (!venueId) {
    return JSON.stringify({
      success: false,
      error: 'venueId is required',
      message: 'You must provide a venueId to edit a venue',
    }, null, 2);
  }

  console.error(`[edit_venue] Updating venue: ${venueId}`);

  try {
    // Build update payload - only include fields that were provided
    const updatePayload: Record<string, unknown> = {};

    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.address !== undefined) updatePayload.address = updateData.address;
    if (updateData.city !== undefined) updatePayload.city = updateData.city;
    if (updateData.nameVariants !== undefined) updatePayload.nameVariants = updateData.nameVariants;
    if (updateData.postcode !== undefined) updatePayload.postcode = updateData.postcode;
    if (updateData.phone !== undefined) updatePayload.phone = updateData.phone;
    if (updateData.website !== undefined) updatePayload.website = updateData.website;
    if (updateData.socialMediaUrls !== undefined) updatePayload.socialMediaUrls = updateData.socialMediaUrls;
    if (updateData.facebookUrl !== undefined) updatePayload.facebookUrl = updateData.facebookUrl;
    if (updateData.instagramUrl !== undefined) updatePayload.instagramUrl = updateData.instagramUrl;
    if (updateData.description !== undefined) updatePayload.description = updateData.description;
    if (updateData.facilities !== undefined) updatePayload.facilities = updateData.facilities;
    if (updateData.profileImageUrl !== undefined) updatePayload.profileImageUrl = updateData.profileImageUrl;
    if (updateData.standardTicketed !== undefined) updatePayload.standardTicketed = updateData.standardTicketed;
    if (updateData.standardTicketUrl !== undefined) updatePayload.standardTicketUrl = updateData.standardTicketUrl;
    if (updateData.standardTicketInformation !== undefined) updatePayload.standardTicketInformation = updateData.standardTicketInformation;
    if (updateData.validated !== undefined) updatePayload.validated = updateData.validated;

    // Feature 19: ownership does NOT go through the generic venue PUT.
    //
    // `PUT /api/venues/:id/mcp` only maps fields. It writes ownerGroupId and
    // leaves TWO derived values behind: `ownerGroupName` on the venue, and
    // `venueCount` on the group. The result reads as a success and looks broken
    // on screen. Godmode shows a dash in the Owner column and a count of 0.
    // Found live on 2026-08-14 after assigning The Alvanley Arms.
    //
    // `PUT /api/venues/:id/group` is the route that owns this write. It
    // validates the group exists, denormalises the name, and moves the count off
    // the old group and onto the new one. Ownership is sent there, always.
    const wantsGroupWrite =
      updateData.ownerGroupId !== undefined || updateData.tenure !== undefined;

    // Handle externalIds with additive merge
    if (updateData.externalIds !== undefined) {
      // Normalize incoming externalIds to strip any doubled prefixes
      const normalizedIncoming = normalizeExternalIds(updateData.externalIds);

      if (updateData.replaceExternalIds) {
        // Replace mode: send normalized array
        updatePayload.externalIds = normalizedIncoming;
      } else {
        // Additive merge mode: fetch current venue and merge
        const currentVenue = await apiRequest<any>(`/api/venues/${venueId}`, 'GET');
        const existingIds: ExternalId[] = currentVenue.externalIds || [];
        updatePayload.externalIds = mergeExternalIds(existingIds, normalizedIncoming);
      }
    }

    // Ownership first. If it fails, fail loudly rather than reporting a partial
    // success: a half-assigned venue is harder to find than an unassigned one.
    let groupResult: GroupWriteResult | undefined;
    if (wantsGroupWrite) {
      // The route treats a missing ownerGroupId as "clear the group". A caller
      // changing ONLY the tenure of an already-assigned venue would therefore
      // wipe its owner. Read the current group and send it back unchanged.
      let targetGroupId: string | null;
      if (updateData.ownerGroupId !== undefined) {
        targetGroupId = updateData.ownerGroupId || null;
      } else {
        const current = await apiRequest<any>(`/api/venues/${venueId}`, 'GET');
        targetGroupId = current.ownerGroupId || current.owner_group_id || null;
      }

      groupResult = await apiRequest<GroupWriteResult>(
        `/api/venues/${venueId}/group`,
        'PUT',
        {
          // An explicit null is required to unassign. undefined drops the key
          // and the route rejects the body.
          ownerGroupId: targetGroupId,
          ...(updateData.tenure !== undefined ? { tenure: updateData.tenure } : {}),
        },
      );
      console.error(`[edit_venue] Owner group set: ${groupResult.ownerGroupName ?? 'cleared'}`);
    }

    // Nothing else to write. Return the group result on its own.
    if (Object.keys(updatePayload).length === 0 && groupResult) {
      return JSON.stringify({
        success: true,
        venue: {
          id: venueId,
          ownerGroupId: groupResult.ownerGroupId,
          ownerGroupName: groupResult.ownerGroupName,
          tenure: groupResult.tenure,
        },
        message: groupResult.ownerGroupId
          ? `Venue assigned to "${groupResult.ownerGroupName}".`
          : 'Venue owner group cleared.',
        updatedFields: ['ownerGroupId', 'tenure'],
      }, null, 2);
    }

    // Call BNDY venues MCP PUT endpoint (no auth required)
    const response = await apiRequest<EditVenueResponse>(
      `/api/venues/${venueId}/mcp`,
      'PUT',
      updatePayload
    );

    console.error(`[edit_venue] Successfully updated venue: ${response.id}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      venue: {
        id: response.id,
        name: response.name,
        address: response.address,
        city: response.city,
        postcode: response.postcode,
        phone: response.phone,
        website: response.website,
        socialMediaUrls: response.social_media_urls,
        facilities: response.facilities,
        profileImageUrl: response.profile_image_url,
        standardTicketed: response.standard_ticketed,
        standardTicketUrl: response.standard_ticket_url,
        standardTicketInformation: response.standard_ticket_information,
        validated: response.validated,
        externalIds: response.externalIds || [],
        ...(groupResult ? {
          ownerGroupId: groupResult.ownerGroupId,
          ownerGroupName: groupResult.ownerGroupName,
          tenure: groupResult.tenure,
        } : {}),
      },
      message: `Venue "${response.name}" updated successfully.`,
      updatedFields: [...Object.keys(updatePayload), ...(groupResult ? ['ownerGroupId', 'tenure'] : [])],
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[edit_venue] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to update venue',
    }, null, 2);
  }
}
