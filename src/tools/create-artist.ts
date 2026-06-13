// Create Artist Tool - MCP Implementation (FIXED)
// Creates a new artist in BNDY with AI review flags

import { apiRequest } from '../utils/http-client.js';
import { normalizeExternalIds } from '../utils/external-ids.js';

interface CreateArtistParams {
  name: string;
  artistType: 'band' | 'solo' | 'duo' | 'trio' | 'group' | 'dj' | 'collective';
  location: string;
  locationType?: 'city' | 'regional';
  bio?: string;
  profileImageUrl?: string;
  genres?: string[];
  facebookUrl?: string;
  instagramUrl?: string;
  spotifyUrl?: string;
  externalIds?: Array<{ source: string; id: string }>;
}

interface CreateArtistResponse {
  message: string;
  artist: {
    id: string;
    name: string;
    location: string;
  };
}

export async function createArtist(params: CreateArtistParams): Promise<string> {
  const { name, artistType, location, locationType, bio, profileImageUrl, genres, facebookUrl, instagramUrl, spotifyUrl, externalIds } = params;

  console.error(`[create_artist] Creating artist "${name}" (${artistType})`);

  try {
    // Normalize incoming externalIds to strip any doubled prefixes
    const normalizedExternalIds = normalizeExternalIds(externalIds || []);

    // Prepare artist data with AI review flags
    const artistData = {
      name,
      artist_type: artistType,
      location: location, // Required field for community endpoint
      ...(locationType && { locationType }), // Optional: 'city' or 'regional'
      bio: bio || '',
      profileImageUrl: profileImageUrl || '',
      genres: genres || [],
      facebookUrl: facebookUrl || '',
      instagramUrl: instagramUrl || '',
      spotifyUrl: spotifyUrl || '',
      externalIds: normalizedExternalIds,
      // AI creation flags (CRITICAL for review queue)
      ai_created: true,
      source: 'mcp_ai_import'
    };

    // Call BNDY artists community endpoint (no auth required)
    const response = await apiRequest<CreateArtistResponse>('/api/artists/community', 'POST', artistData);

    console.error(`[create_artist] Successfully created artist: ${response.artist.id}`);

    // Return formatted response
    return JSON.stringify({
      success: true,
      artist: {
        id: response.artist.id,
        name: response.artist.name,
        artistType: artistType,
        genres: genres || [],
        aiCreated: true,
        needsReview: true
      },
      message: `Artist "${name}" created successfully. Flagged for manual review.`,
      warning: 'This artist was created by AI and requires manual review before appearing in production.'
    }, null, 2);

  } catch (error: any) {
    console.error(`[create_artist] Error:`, error);
    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to create artist'
    }, null, 2);
  }
}
