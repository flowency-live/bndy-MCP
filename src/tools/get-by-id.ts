// Get By ID Tool - MCP Implementation
// Fetches full venue, artist, or event record by bndy UUID

import { apiRequest } from '../utils/http-client.js';

export interface GetByIdParams {
  entityType: 'venue' | 'artist' | 'event';
  id: string; // bndy UUID
}

export async function getById(params: GetByIdParams): Promise<string> {
  const { entityType, id } = params;

  // Validate required fields
  if (!entityType || !id) {
    return JSON.stringify({
      found: false,
      error: 'entityType and id are required',
      message: 'You must provide entityType (venue/artist/event) and id (bndy UUID)',
    }, null, 2);
  }

  // Validate entityType
  if (!['venue', 'artist', 'event'].includes(entityType)) {
    return JSON.stringify({
      found: false,
      error: `Invalid entityType: "${entityType}". Must be "venue", "artist", or "event"`,
      message: 'entityType must be one of: venue, artist, event',
    }, null, 2);
  }

  console.error(`[get_by_id] Fetching ${entityType} with id: ${id}`);

  try {
    // Build the lookup URL
    // Events use the MCP endpoint (no auth required): /api/events/{id}/mcp
    // Venues and artists use their standard endpoints (also public)
    const lookupUrl = entityType === 'event'
      ? `/api/events/${encodeURIComponent(id)}/mcp`
      : `/api/${entityType}s/${encodeURIComponent(id)}`;

    // Call the BNDY API endpoint
    const entity = await apiRequest<Record<string, unknown>>(lookupUrl, 'GET');

    if (!entity || !entity.id) {
      console.error(`[get_by_id] No ${entityType} found with id: ${id}`);
      return JSON.stringify({
        found: false,
        entityType,
        id,
        message: `No ${entityType} found with id ${id}`,
      }, null, 2);
    }

    console.error(`[get_by_id] Found ${entityType} with id: ${id}`);

    // Return the full entity based on type
    if (entityType === 'venue') {
      return JSON.stringify({
        found: true,
        entityType: 'venue',
        venue: {
          id: entity.id,
          name: entity.name,
          address: entity.address,
          city: entity.city,
          postcode: entity.postcode,
          latitude: entity.latitude,
          longitude: entity.longitude,
          googlePlaceId: entity.googlePlaceId || entity.google_place_id,
          phone: entity.phone,
          website: entity.website,
          facilities: entity.facilities || [],
          socialMediaUrls: entity.socialMediaUrls || entity.social_media_urls || [],
          profileImageUrl: entity.profileImageUrl || entity.profile_image_url,
          nameVariants: entity.nameVariants || entity.name_variants || [],
          externalIds: entity.externalIds || entity.external_ids || [],
          standardTicketed: entity.standardTicketed || entity.standard_ticketed,
          standardTicketUrl: entity.standardTicketUrl || entity.standard_ticket_url,
          standardTicketInformation: entity.standardTicketInformation || entity.standard_ticket_information,
          validated: entity.validated,
          aiCreated: entity.ai_created,
          needsReview: entity.needs_review,
          createdSource: entity.created_source,
          createdAt: entity.createdAt || entity.created_at,
          updatedAt: entity.updatedAt || entity.updated_at,
        },
        message: `Found venue "${entity.name}"`,
      }, null, 2);
    }

    if (entityType === 'artist') {
      return JSON.stringify({
        found: true,
        entityType: 'artist',
        artist: {
          id: entity.id,
          name: entity.name,
          artistType: entity.artistType || entity.artist_type,
          location: entity.location,
          bio: entity.bio,
          genres: entity.genres || [],
          acoustic: entity.acoustic,
          actType: entity.actType || entity.act_type || [],
          profileImageUrl: entity.profileImageUrl || entity.profile_image_url,
          nameVariants: entity.nameVariants || entity.name_variants || [],
          externalIds: entity.externalIds || entity.external_ids || [],
          facebookUrl: entity.facebookUrl || entity.facebook_url,
          instagramUrl: entity.instagramUrl || entity.instagram_url,
          websiteUrl: entity.websiteUrl || entity.website_url,
          youtubeUrl: entity.youtubeUrl || entity.youtube_url,
          spotifyUrl: entity.spotifyUrl || entity.spotify_url,
          twitterUrl: entity.twitterUrl || entity.twitter_url,
          aiCreated: entity.ai_created,
          needsReview: entity.needs_review,
          createdSource: entity.created_source,
          createdAt: entity.createdAt || entity.created_at,
          updatedAt: entity.updatedAt || entity.updated_at,
        },
        message: `Found artist "${entity.name}"`,
      }, null, 2);
    }

    // entityType === 'event'
    return JSON.stringify({
      found: true,
      entityType: 'event',
      event: {
        id: entity.id,
        title: entity.title,
        date: entity.date,
        startTime: entity.startTime || entity.start_time,
        endTime: entity.endTime || entity.end_time,
        artistId: entity.artistId || entity.artist_id,
        artistName: entity.artistName || entity.artist_name,
        artistIds: entity.artistIds || [],
        artistNames: entity.artistNames || [],
        venueId: entity.venueId || entity.venue_id,
        venueName: entity.venueName || entity.venue_name,
        venueCity: entity.venueCity || entity.venue_city,
        description: entity.description,
        ticketed: entity.ticketed,
        ticketUrl: entity.ticketUrl || entity.ticket_url,
        ticketInformation: entity.ticketInformation || entity.ticketinformation || entity.ticket_information,
        price: entity.price,
        imageUrl: entity.imageUrl || entity.image_url,
        eventUrl: entity.eventUrl || entity.event_url,
        notes: entity.notes,
        isPublic: entity.isPublic || entity.is_public,
        externalIds: entity.externalIds || entity.external_ids || [],
        aiCreated: entity.ai_created,
        needsReview: entity.needs_review,
        createdSource: entity.created_source,
        createdAt: entity.createdAt || entity.created_at,
        updatedAt: entity.updatedAt || entity.updated_at,
      },
      message: `Found event "${entity.title}"`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[get_by_id] Error:`, error);

    // Check if it's a 404 (not found) vs actual error
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      return JSON.stringify({
        found: false,
        entityType,
        id,
        message: `No ${entityType} found with id ${id}`,
      }, null, 2);
    }

    return JSON.stringify({
      found: false,
      error: errorMessage,
      message: `Failed to fetch ${entityType} by id`,
    }, null, 2);
  }
}
