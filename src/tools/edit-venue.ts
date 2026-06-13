// Edit Venue Tool - MCP Implementation
// Updates an existing venue in BNDY via PUT /api/venues/:id

import { apiRequest } from '../utils/http-client.js';
import { mergeExternalIds, normalizeExternalIds, ExternalId } from '../utils/external-ids.js';

interface SocialMediaUrl {
  platform: 'website' | 'facebook' | 'instagram' | 'youtube' | 'x' | 'spotify';
  url: string;
}

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
  facilities?: string[];
  profileImageUrl?: string;
  standardTicketed?: boolean;
  standardTicketUrl?: string;
  standardTicketInformation?: string;
  validated?: boolean;
  externalIds?: Array<{ source: string; id: string }>;
  replaceExternalIds?: boolean;
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
    if (updateData.facilities !== undefined) updatePayload.facilities = updateData.facilities;
    if (updateData.profileImageUrl !== undefined) updatePayload.profileImageUrl = updateData.profileImageUrl;
    if (updateData.standardTicketed !== undefined) updatePayload.standardTicketed = updateData.standardTicketed;
    if (updateData.standardTicketUrl !== undefined) updatePayload.standardTicketUrl = updateData.standardTicketUrl;
    if (updateData.standardTicketInformation !== undefined) updatePayload.standardTicketInformation = updateData.standardTicketInformation;
    if (updateData.validated !== undefined) updatePayload.validated = updateData.validated;

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

    // Call BNDY venues PUT endpoint
    const response = await apiRequest<EditVenueResponse>(
      `/api/venues/${venueId}`,
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
      },
      message: `Venue "${response.name}" updated successfully.`,
      updatedFields: Object.keys(updatePayload),
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
