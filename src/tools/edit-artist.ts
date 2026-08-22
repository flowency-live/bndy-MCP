// Edit Artist Tool - MCP Implementation
// Updates an existing artist in BNDY via PUT /api/artists/:id/mcp
// Uses MCP-specific endpoint that doesn't require authentication

import { apiRequest } from '../utils/http-client.js';
import { mergeExternalIds, normalizeExternalIds, ExternalId } from '../utils/external-ids.js';

export interface EditArtistParams {
  artistId: string;
  name?: string;
  artistType?: 'band' | 'solo' | 'duo' | 'trio' | 'group' | 'dj' | 'collective';
  location?: string;
  locationType?: 'city' | 'regional';
  bio?: string;
  genres?: string[];
  facebookUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  twitterUrl?: string;
  profileImageUrl?: string;
  acoustic?: boolean;
  actType?: ('originals' | 'covers' | 'tribute')[];
  externalIds?: Array<{ source: string; id: string }>;
  replaceExternalIds?: boolean;
  nameVariants?: string[];
  replaceNameVariants?: boolean;
}

interface EditArtistResponse {
  id: string;
  name: string;
  artist_type?: string;
  location?: string;
  bio?: string;
  genres?: string[];
  facebookUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  twitterUrl?: string;
  profileImageUrl?: string;
  externalIds?: Array<{ source: string; id: string }>;
}

export async function editArtist(params: EditArtistParams): Promise<string> {
  const { artistId, ...updateData } = params;

  // Validate required field
  if (!artistId) {
    return JSON.stringify({
      success: false,
      error: 'artistId is required',
      message: 'You must provide an artistId to edit an artist',
    }, null, 2);
  }

  console.error(`[edit_artist] Updating artist: ${artistId}`);

  try {
    // Build update payload - only include fields that were provided
    const updatePayload: Record<string, unknown> = {};

    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.artistType !== undefined) updatePayload.artistType = updateData.artistType;
    if (updateData.location !== undefined) updatePayload.location = updateData.location;
    if (updateData.locationType !== undefined) updatePayload.locationType = updateData.locationType;
    if (updateData.bio !== undefined) updatePayload.bio = updateData.bio;
    if (updateData.genres !== undefined) updatePayload.genres = updateData.genres;
    if (updateData.facebookUrl !== undefined) updatePayload.facebookUrl = updateData.facebookUrl;
    if (updateData.instagramUrl !== undefined) updatePayload.instagramUrl = updateData.instagramUrl;
    if (updateData.websiteUrl !== undefined) updatePayload.websiteUrl = updateData.websiteUrl;
    if (updateData.youtubeUrl !== undefined) updatePayload.youtubeUrl = updateData.youtubeUrl;
    if (updateData.spotifyUrl !== undefined) updatePayload.spotifyUrl = updateData.spotifyUrl;
    if (updateData.twitterUrl !== undefined) updatePayload.twitterUrl = updateData.twitterUrl;
    if (updateData.profileImageUrl !== undefined) updatePayload.profileImageUrl = updateData.profileImageUrl;
    if (updateData.acoustic !== undefined) updatePayload.acoustic = updateData.acoustic;
    if (updateData.actType !== undefined) updatePayload.actType = updateData.actType;

    // Handle externalIds with additive merge
    if (updateData.externalIds !== undefined) {
      // Normalize incoming externalIds to strip any doubled prefixes
      const normalizedIncoming = normalizeExternalIds(updateData.externalIds);

      if (updateData.replaceExternalIds) {
        // Replace mode: send normalized array
        updatePayload.externalIds = normalizedIncoming;
      } else {
        // Additive merge mode: fetch current artist and merge
        const currentArtist = await apiRequest<any>(`/api/artists/${artistId}`, 'GET');
        // API returns external_ids (snake_case), handle both formats
        const existingIds: ExternalId[] = currentArtist.externalIds || currentArtist.external_ids || [];
        updatePayload.externalIds = mergeExternalIds(existingIds, normalizedIncoming);
      }
    }

    // Handle nameVariants with additive merge (default) or replace
    if (updateData.nameVariants !== undefined) {
      if (updateData.replaceNameVariants) {
        // Replace mode: send array as-is
        updatePayload.nameVariants = updateData.nameVariants;
      } else {
        // Additive merge mode: fetch current artist and merge unique
        const currentArtist = await apiRequest<any>(`/api/artists/${artistId}`, 'GET');
        const existingVariants: string[] = currentArtist.nameVariants || currentArtist.name_variants || [];
        // Merge and deduplicate (case-insensitive)
        const existingLower = new Set(existingVariants.map(v => v.toLowerCase()));
        const merged = [...existingVariants];
        for (const variant of updateData.nameVariants) {
          if (!existingLower.has(variant.toLowerCase())) {
            merged.push(variant);
            existingLower.add(variant.toLowerCase());
          }
        }
        updatePayload.nameVariants = merged;
      }
    }

    // Call BNDY artists MCP endpoint (no auth required)
    const response = await apiRequest<EditArtistResponse>(
      `/api/artists/${artistId}/mcp`,
      'PUT',
      updatePayload
    );

    console.error(`[edit_artist] Successfully updated artist: ${response.id}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      artist: {
        id: response.id,
        name: response.name,
        artistType: response.artist_type,
        location: response.location,
        bio: response.bio,
        genres: response.genres,
        facebookUrl: response.facebookUrl,
        instagramUrl: response.instagramUrl,
        websiteUrl: response.websiteUrl,
        youtubeUrl: response.youtubeUrl,
        spotifyUrl: response.spotifyUrl,
        profileImageUrl: response.profileImageUrl,
        externalIds: response.externalIds || [],
      },
      message: `Artist "${response.name}" updated successfully.`,
      updatedFields: Object.keys(updatePayload),
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[edit_artist] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to update artist',
    }, null, 2);
  }
}
