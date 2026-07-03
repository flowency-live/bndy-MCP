// Get By External ID Tool - MCP Implementation
// Looks up venues, artists, or events by their external system reference

import { apiRequest } from '../utils/http-client.js';
import { normalizeExternalId } from '../utils/external-ids.js';

export interface GetByExternalIdParams {
  entityType: 'venue' | 'artist' | 'event' | 'festival';
  source: string;  // e.g., "onthecasemusic", "songkick", "bandsintown"
  id: string;      // The ID in that external system
}

interface ExternalId {
  source: string;
  id: string;
}

interface BaseEntity {
  id: string;
  externalIds?: ExternalId[];
}

interface VenueEntity extends BaseEntity {
  name: string;
  address: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
}

interface ArtistEntity extends BaseEntity {
  name: string;
  artistType?: string;
  location?: string;
  genres?: string[];
}

interface EventEntity extends BaseEntity {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  artistId: string;
  venueId?: string;
  isPublic?: boolean;
}

interface FestivalEntity extends BaseEntity {
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  town?: string;
  venueIds?: string[];
  isPublic?: boolean;
}

export async function getByExternalId(params: GetByExternalIdParams): Promise<string> {
  const { entityType, source, id } = params;

  // Validate required fields
  if (!entityType || !source || !id) {
    return JSON.stringify({
      found: false,
      error: 'entityType, source, and id are all required',
      message: 'You must provide entityType (venue/artist/event), source, and id',
    }, null, 2);
  }

  // Validate entityType
  if (!['venue', 'artist', 'event', 'festival'].includes(entityType)) {
    return JSON.stringify({
      found: false,
      error: `Invalid entityType: "${entityType}". Must be "venue", "artist", "event", or "festival"`,
      message: 'entityType must be one of: venue, artist, event, festival',
    }, null, 2);
  }

  // Normalize the external ID to strip any doubled prefix (e.g., "klma:klma:venue-123" -> "klma:venue-123")
  const normalized = normalizeExternalId({ source, id });
  const normalizedId = normalized.id;

  console.error(`[get_by_external_id] Looking up ${entityType} with ${source}:${normalizedId}`);

  try {
    // Build the lookup URL - endpoints follow pattern: /api/{entityType}s/by-external-id
    const lookupUrl = `/api/${entityType}s/by-external-id?source=${encodeURIComponent(source)}&id=${encodeURIComponent(normalizedId)}`;

    // Call the appropriate BNDY API endpoint
    const response = await apiRequest<{ found: boolean; [key: string]: unknown }>(lookupUrl, 'GET');

    if (!response.found) {
      console.error(`[get_by_external_id] No ${entityType} found with ${source}:${normalizedId}`);
      return JSON.stringify({
        found: false,
        entityType,
        source,
        externalId: normalizedId,
        message: `No ${entityType} found with external ID ${source}:${normalizedId}`,
      }, null, 2);
    }

    console.error(`[get_by_external_id] Found ${entityType} with ${source}:${normalizedId}`);

    // Extract the entity from response based on type
    const entity = response[entityType] as VenueEntity | ArtistEntity | EventEntity | FestivalEntity;

    // Return formatted response based on entity type
    if (entityType === 'venue') {
      const venue = entity as VenueEntity;
      return JSON.stringify({
        found: true,
        entityType: 'venue',
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          city: venue.city,
          latitude: venue.latitude,
          longitude: venue.longitude,
          googlePlaceId: venue.googlePlaceId,
          externalIds: venue.externalIds || [],
        },
        message: `Found venue "${venue.name}" with external ID ${source}:${normalizedId}`,
      }, null, 2);
    }

    if (entityType === 'artist') {
      const artist = entity as ArtistEntity;
      return JSON.stringify({
        found: true,
        entityType: 'artist',
        artist: {
          id: artist.id,
          name: artist.name,
          artistType: artist.artistType,
          location: artist.location,
          genres: artist.genres,
          externalIds: artist.externalIds || [],
        },
        message: `Found artist "${artist.name}" with external ID ${source}:${normalizedId}`,
      }, null, 2);
    }

    if (entityType === 'event') {
      const event = entity as EventEntity;
      return JSON.stringify({
        found: true,
        entityType: 'event',
        event: {
          id: event.id,
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          artistId: event.artistId,
          venueId: event.venueId,
          isPublic: event.isPublic,
          externalIds: event.externalIds || [],
        },
        message: `Found event "${event.title}" with external ID ${source}:${normalizedId}`,
      }, null, 2);
    }

    // entityType === 'festival'
    const festival = entity as FestivalEntity;
    return JSON.stringify({
      found: true,
      entityType: 'festival',
      festival: {
        id: festival.id,
        name: festival.name,
        slug: festival.slug,
        startDate: festival.startDate,
        endDate: festival.endDate,
        town: festival.town,
        venueIds: festival.venueIds || [],
        isPublic: festival.isPublic,
        externalIds: festival.externalIds || [],
      },
      message: `Found festival "${festival.name}" with external ID ${source}:${normalizedId}`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[get_by_external_id] Error:`, error);

    // Check if it's a 404 (not found) vs actual error
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      return JSON.stringify({
        found: false,
        entityType,
        source,
        externalId: normalizedId,
        message: `No ${entityType} found with external ID ${source}:${normalizedId}`,
      }, null, 2);
    }

    return JSON.stringify({
      found: false,
      error: errorMessage,
      message: `Failed to look up ${entityType} by external ID`,
    }, null, 2);
  }
}
