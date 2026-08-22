#!/usr/bin/env node

// BNDY MCP Server - AI-Driven Event Creation
// Connects Claude Desktop to BNDY AWS Lambda infrastructure

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVenue } from './tools/search-venue.js';
import { createVenue } from './tools/create-venue.js';
import { searchArtist } from './tools/search-artist.js';
import { createArtist } from './tools/create-artist.js';
import { createEvent } from './tools/create-event.js';
import { editArtist } from './tools/edit-artist.js';
import { listArtists } from './tools/list-artists.js';
import { listVenues } from './tools/list-venues.js';
import { editVenue } from './tools/edit-venue.js';
import { editEvent } from './tools/edit-event.js';
import { searchEvent } from './tools/search-event.js';
import { uploadEventPoster } from './tools/upload-event-poster.js';
import { bulkImport } from './tools/bulk-import.js';
import { getByExternalId } from './tools/get-by-external-id.js';
import { getById } from './tools/get-by-id.js';
import { deleteEvent } from './tools/delete-event.js';
import { deleteArtist } from './tools/delete-artist.js';
import { deleteVenue } from './tools/delete-venue.js';
import { enrichVenue } from './tools/enrich-venue.js';
import { listCaptures, getCapture, updateCaptureStatus, addCaptureNotes } from './tools/captures.js';
import { recordRun } from './tools/record-run.js';
// Festival tools (Phase 1a - festival-mcp-write-api-spec §2)
import { createFestival } from './tools/create-festival.js';
import { editFestival } from './tools/edit-festival.js';
import { searchFestival } from './tools/search-festival.js';
import { addLineupSlot } from './tools/add-lineup-slot.js';
import { resolveLineupSlot } from './tools/resolve-lineup-slot.js';
import { deleteFestival } from './tools/delete-festival.js';
// Venue groups (Feature 19 - venue ownership)
import { listVenueGroups, createVenueGroup } from './tools/venue-groups.js';

// Initialize MCP server
const server = new Server(
  {
    name: 'bndy-events',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_venue',
      description: 'Search for existing venues in BNDY database by name and city. Use this BEFORE creating a new venue to avoid duplicates. Confidence = (1 - levenshtein_distance/max_length) * 100. Thresholds: ≥90 high, ≥70 medium, <70 low.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Venue name (e.g., "Murphys", "The Prince of Wales")',
          },
          city: {
            type: 'string',
            description: 'City where venue is located (e.g., "Bury", "Congleton")',
          },
        },
        required: ['name', 'city'],
      },
    },
    {
      name: 'create_venue',
      description: 'Find or create a venue in BNDY. Automatically enriches with Google Places data and deduplicates via Place ID match. Returns existing venueId if matched, otherwise creates new. Safe to call without pre-checking via search_venue.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Official venue name',
          },
          address: {
            type: 'string',
            description: 'Full address including city and postcode',
          },
          city: {
            type: 'string',
            description: 'City name',
          },
          googlePlaceId: {
            type: 'string',
            description: 'Google Place ID (optional but strongly recommended for accuracy)',
          },
          latitude: {
            type: 'number',
            description: 'Latitude coordinate (optional)',
          },
          longitude: {
            type: 'number',
            description: 'Longitude coordinate (optional)',
          },
          facebookUrl: {
            type: 'string',
            description: 'Facebook page URL (optional - e.g., "https://www.facebook.com/venuename")',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references for cross-referencing (optional)',
          },
        },
        required: ['name', 'address', 'city'],
      },
    },
    {
      name: 'search_artist',
      description: 'Search for existing artists in BNDY database by name. Pre-filters by name similarity, then scores by Levenshtein distance. Confidence = (1 - edit_distance/max_length) * 100.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Artist name to search for',
          },
          region: {
            type: 'string',
            description: 'Region filter (e.g., "North East", "Manchester"). Hard filter: only returns artists whose location contains this string (empty/unknown locations pass through).',
          },
          limit: {
            type: 'integer',
            description: 'Max results to return (default: 20, max: 50). Set to 0 for unlimited.',
          },
          minConfidence: {
            type: 'integer',
            description: 'Minimum confidence threshold 0-100 (default: 50). Results below this are excluded.',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'create_artist',
      description: 'Find-or-create an artist in BNDY. Server-side resolution (ADR-014): normalises the name and returns {action: matched|review|created}. When action:review is returned with candidates, RETRY with either resolveTo (candidate id) OR confirmNew (true). For acts whose own FB page name includes a descriptor tail (e.g. "NU CALL - Nu-Metal Tribute Band"), set verifiedSourceName:true + facebookUrl to bypass §2A.5 validation.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Artist name',
          },
          artistType: {
            type: 'string',
            enum: ['band', 'solo', 'duo', 'trio', 'group', 'dj', 'collective'],
            description: 'Type of artist',
          },
          location: {
            type: 'string',
            description: 'Artist location (city or region, e.g., "North East", "Manchester", "London")',
          },
          locationType: {
            type: 'string',
            enum: ['city', 'regional'],
            description: 'Location type: "city" for specific city/town (with coordinates), "regional" for wider area like "North East UK"',
          },
          bio: {
            type: 'string',
            description: 'Artist biography',
          },
          profileImageUrl: {
            type: 'string',
            description: 'Optional profile image URL. If external, Lambda will download and upload to S3 for permanent storage.',
          },
          genres: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'Rock', 'Rock n Roll', 'Grunge', 'Metal', 'Punk', 'Alternative', 'New Wave', 'Hardcore',
                'Pop', 'Indie', 'Britpop', 'Mod',
                'Blues', 'R&B', 'Country', 'Americana',
                'Folk', 'Soul', 'Funk', 'Motown', 'Disco',
                'Electronic', 'Dance',
                'Jazz', 'Classical', 'Reggae', 'Ska', 'Latin', 'Irish',
                '50s', '60s', '70s', '80s', '90s', '00s',
                'Other'
              ]
            },
            description: 'Optional array of music genres (must be from canonical list)',
          },
          actType: {
            type: 'array',
            items: { type: 'string', enum: ['originals', 'covers', 'tribute'] },
            description: 'Whether the act plays its own material, covers, or is a tribute act. Set this on create — it is not inferable later.',
          },
          facebookUrl: {
            type: 'string',
            description: 'Optional Facebook URL',
          },
          instagramUrl: {
            type: 'string',
            description: 'Optional Instagram URL',
          },
          spotifyUrl: {
            type: 'string',
            description: 'Optional Spotify URL',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references for cross-referencing (optional)',
          },
          nameVariants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alternative names / billing strings that mean THIS artist. These are used for identity resolution — an incoming event with one of these names will match this artist instead of creating a duplicate.',
          },
          resolveTo: {
            type: 'string',
            description: 'RESOLUTION PARAM: When action:review was returned, pass a candidate id here to link to that existing artist instead of creating a new one. Use exactly one of resolveTo OR confirmNew, never both.',
          },
          confirmNew: {
            type: 'boolean',
            description: 'RESOLUTION PARAM: When action:review was returned, set true to confirm this is genuinely a new artist despite shared tokens with existing candidates. Use exactly one of resolveTo OR confirmNew, never both.',
          },
          verifiedSourceName: {
            type: 'boolean',
            description: 'BYPASS §2A.5: Set true ONLY when the name (including any descriptor tail like "- Nu-Metal Tribute Band") is the act\'s OWN Facebook page name. Requires facebookUrl to be set. Bypasses the descriptor-tail validation that would otherwise reject the name.',
          },
        },
        required: ['name', 'artistType', 'location'],
      },
    },
    {
      name: 'create_event',
      description: 'Create an event in BNDY linking one or more artists to a venue on a date. startTime is OPTIONAL: omit it when the source gives no time and the server applies the RUNBOOK 5.6 default (Fri/Sat 21:00, Sun 19:00, other weekdays 20:00, afternoon 14:00). NEVER ask the user for a start time. NEVER invent one. A missing time is not a blocker.',
      inputSchema: {
        type: 'object',
        properties: {
          artistId: {
            type: 'string',
            description: 'Single artist UUID (use artistIds for multi-artist events)',
          },
          artistIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of artist UUIDs for multi-artist events (preferred over artistId)',
          },
          venueId: {
            type: 'string',
            description: 'Venue UUID (from search_venue or create_venue)',
          },
          date: {
            type: 'string',
            description: 'Event date in YYYY-MM-DD format',
          },
          startTime: {
            type: 'string',
            description: 'OPTIONAL. Start time in HH:MM (24-hour). Supply it ONLY when the source states a time. If the source states no time, OMIT this field. The server then applies RUNBOOK 5.6: Fri/Sat 21:00, Sun 19:00, other weekdays 20:00. NEVER ask the user for a start time. NEVER invent one. The response returns startTimeDefaulted: true when the default was applied. Report that in the run report.',
          },
          afternoon: {
            type: 'boolean',
            description: 'Set true ONLY when the source indicates an afternoon gig. Defaults startTime to 14:00 per RUNBOOK 5.6. Ignored when startTime is supplied.',
          },
          endTime: {
            type: 'string',
            description: 'Optional end time in HH:MM format. Defaults to 00:00 (midnight).',
          },
          title: {
            type: 'string',
            description: 'Optional event title (defaults to "Artist @ Venue")',
          },
          isPublic: {
            type: 'boolean',
            description: 'Whether event should appear on public Frontstage map (default: false)',
          },
          isOpenMic: {
            type: 'boolean',
            description: 'Open mic night. Artists become optional (the host, if any). Stored as isOpenMic + type "open-mic".',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references for cross-referencing (optional)',
          },
          // Enrichment fields (parity with edit_event)
          price: {
            type: 'string',
            description: 'Ticket price (e.g., "FREE", "£15", "£10-£20")',
          },
          eventUrl: {
            type: 'string',
            description: 'URL to the source event page',
          },
          ticketed: {
            type: 'boolean',
            description: 'Whether event requires tickets (true) or is free/door entry (false)',
          },
          ticketInformation: {
            type: 'string',
            description: 'Additional ticket information text',
          },
          ticketUrl: {
            type: 'string',
            description: 'URL to purchase tickets',
          },
          imageUrl: {
            type: 'string',
            description: 'Event poster/image URL',
          },
          description: {
            type: 'string',
            description: 'Long-form event description',
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the event',
          },
          // Festival fields (Phase 1a)
          festivalId: {
            type: 'string',
            description: 'Links event to parent festival (creates child event)',
          },
          stageId: {
            type: 'string',
            description: 'Stage ID within festival',
          },
          billing: {
            type: 'string',
            enum: ['headline', 'special_guest', 'support', 'general', 'opener'],
            description: 'Billing tier for festival events',
          },
          billingOrder: {
            type: 'number',
            description: 'Sort order within billing tier (0 = top)',
          },
        },
        // startTime is deliberately NOT required. RUNBOOK 5.6 supplies the
        // default so no agent ever has to ask a human or guess a time.
        required: ['venueId', 'date'],
      },
    },
    {
      name: 'search_event',
      description: 'Search for events by artist ID, venue ID, or festival ID. Defaults to today + 12 months if no date range specified.',
      inputSchema: {
        type: 'object',
        properties: {
          artistId: {
            type: 'string',
            description: 'Artist UUID to find events for',
          },
          venueId: {
            type: 'string',
            description: 'Venue UUID to find events at',
          },
          festivalId: {
            type: 'string',
            description: 'Festival UUID to find child events for',
          },
          dateFrom: {
            type: 'string',
            description: 'Filter events from this date YYYY-MM-DD (defaults to today)',
          },
          dateTo: {
            type: 'string',
            description: 'Filter events until this date YYYY-MM-DD (defaults to today + 12 months)',
          },
        },
        required: [],
      },
    },
    {
      name: 'edit_artist',
      description: 'Update an existing artist in BNDY. Use this to add location, genres, social media URLs, bio, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          artistId: {
            type: 'string',
            description: 'Artist UUID to update',
          },
          name: {
            type: 'string',
            description: 'Updated artist name',
          },
          artistType: {
            type: 'string',
            enum: ['band', 'solo', 'duo', 'trio', 'group', 'dj', 'collective'],
            description: 'Type of artist',
          },
          location: {
            type: 'string',
            description: 'Artist location (city or region)',
          },
          locationType: {
            type: 'string',
            enum: ['city', 'regional'],
            description: 'Location type: "city" for specific city/town (with coordinates), "regional" for wider area like "North East UK"',
          },
          bio: {
            type: 'string',
            description: 'Artist biography',
          },
          genres: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'Rock', 'Rock n Roll', 'Grunge', 'Metal', 'Punk', 'Alternative', 'New Wave',
                'Pop', 'Indie', 'Britpop', 'Mod',
                'Blues', 'R&B', 'Country', 'Americana',
                'Folk', 'Soul', 'Funk', 'Motown', 'Disco',
                'Electronic', 'Dance',
                'Jazz', 'Classical', 'Reggae', 'Ska', 'Latin',
                '50s', '60s', '70s', '80s', '90s', '00s',
                'Other'
              ]
            },
            description: 'Music genres (must be from canonical list)',
          },
          facebookUrl: {
            type: 'string',
            description: 'Facebook page URL',
          },
          instagramUrl: {
            type: 'string',
            description: 'Instagram URL',
          },
          websiteUrl: {
            type: 'string',
            description: 'Artist website URL',
          },
          youtubeUrl: {
            type: 'string',
            description: 'YouTube channel URL',
          },
          spotifyUrl: {
            type: 'string',
            description: 'Spotify artist URL',
          },
          twitterUrl: {
            type: 'string',
            description: 'Twitter/X URL',
          },
          profileImageUrl: {
            type: 'string',
            description: 'Profile image URL',
          },
          acoustic: {
            type: 'boolean',
            description: 'Whether the artist performs acoustic sets',
          },
          actType: {
            type: 'array',
            items: { type: 'string', enum: ['originals', 'covers', 'tribute'] },
            description: 'Type of act (originals, covers, tribute)',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references (additive merge by default)',
          },
          replaceExternalIds: {
            type: 'boolean',
            description: 'If true, replace all externalIds instead of merging (default: false)',
          },
          nameVariants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alternative names / billing strings that mean THIS artist (e.g., "Pv Rocks" for "Poole Vigilantes"). Additive merge by default - new variants are added to existing list.',
          },
          replaceNameVariants: {
            type: 'boolean',
            description: 'If true, replace all nameVariants instead of merging (default: false)',
          },
        },
        required: ['artistId'],
      },
    },
    {
      name: 'delete_artist',
      description: 'Permanently delete an artist from BNDY. Use search_artist or get_by_id first to verify you have the correct artist ID.',
      inputSchema: {
        type: 'object',
        properties: {
          artistId: {
            type: 'string',
            description: 'Artist UUID to permanently delete',
          },
        },
        required: ['artistId'],
      },
    },
    {
      name: 'list_artists',
      description: 'List artists with pagination and optional filters for missing data. Use this to find artists that need enrichment (missing location, genres, social URLs, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum records to return (default: 100, max: 500)',
          },
          offset: {
            type: 'number',
            description: 'Number of records to skip for pagination (default: 0)',
          },
          missingSocials: {
            type: 'boolean',
            description: 'Filter to artists with no Facebook, Instagram, or website',
          },
          missingLocation: {
            type: 'boolean',
            description: 'Filter to artists with no location set',
          },
          missingGenres: {
            type: 'boolean',
            description: 'Filter to artists with no genres set',
          },
          region: {
            type: 'string',
            description: 'Filter by location containing this string (e.g., "North East", "Manchester")',
          },
          createdSince: {
            type: 'string',
            description: 'Filter to artists created after this ISO date (e.g., "2024-01-01")',
          },
        },
        required: [],
      },
    },
    {
      name: 'list_venues',
      description: 'List venues with pagination and optional filters for missing data. Use this to find venues that need enrichment (missing address, coordinates, social URLs, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum records to return (default: 100, max: 500)',
          },
          offset: {
            type: 'number',
            description: 'Number of records to skip for pagination (default: 0)',
          },
          missingSocials: {
            type: 'boolean',
            description: 'Filter to venues with no website or social media URLs',
          },
          missingAddress: {
            type: 'boolean',
            description: 'Filter to venues with no address set',
          },
          missingCity: {
            type: 'boolean',
            description: 'Filter to venues with no city set',
          },
          missingCoordinates: {
            type: 'boolean',
            description: 'Filter to venues with no latitude/longitude',
          },
          region: {
            type: 'string',
            description: 'Filter by address/city containing this string (e.g., "North East", "Manchester")',
          },
          city: {
            type: 'string',
            description: 'Filter by exact city match',
          },
          createdSince: {
            type: 'string',
            description: 'Filter to venues created after this ISO date (e.g., "2024-01-01")',
          },
          aiCreated: {
            type: 'boolean',
            description: 'Filter by AI-created status (true = AI created, false = user created)',
          },
        },
        required: [],
      },
    },
    {
      name: 'edit_venue',
      description: 'Update an existing venue in BNDY. Use this to add social media URLs, facilities, ticket info, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          venueId: {
            type: 'string',
            description: 'Venue UUID to update',
          },
          name: {
            type: 'string',
            description: 'Updated venue name',
          },
          address: {
            type: 'string',
            description: 'Full address',
          },
          city: {
            type: 'string',
            description: 'City name',
          },
          nameVariants: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alternative names / aliases for the venue (e.g., "The Prince", "Prince of Wales Pub")',
          },
          postcode: {
            type: 'string',
            description: 'Postcode',
          },
          phone: {
            type: 'string',
            description: 'Contact phone number',
          },
          website: {
            type: 'string',
            description: 'Venue website URL',
          },
          socialMediaUrls: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                platform: { type: 'string' },
                url: { type: 'string' },
              },
            },
            description: 'Social media links array with platform and url',
          },
          facebookUrl: {
            type: 'string',
            description: 'Facebook page URL (convenience field, also stored in socialMediaUrls)',
          },
          instagramUrl: {
            type: 'string',
            description: 'Instagram profile URL (convenience field, also stored in socialMediaUrls)',
          },
          description: {
            type: 'string',
            description: 'Venue description text',
          },
          facilities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Venue facilities (e.g., parking, disabled_access)',
          },
          profileImageUrl: {
            type: 'string',
            description: 'Profile image URL',
          },
          standardTicketed: {
            type: 'boolean',
            description: 'Whether venue typically requires tickets',
          },
          standardTicketUrl: {
            type: 'string',
            description: 'Default ticket purchase URL',
          },
          standardTicketInformation: {
            type: 'string',
            description: 'Default ticket information text',
          },
          validated: {
            type: 'boolean',
            description: 'Whether venue has been validated',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references (additive merge by default)',
          },
          replaceExternalIds: {
            type: 'boolean',
            description: 'If true, replace all externalIds instead of merging (default: false)',
          },
          ownerGroupId: {
            type: 'string',
            description: 'Feature 19: Venue owner group UUID (e.g., Robinsons Brewery). Use list_venue_groups to find or create_venue_group to create.',
          },
          tenure: {
            type: 'string',
            enum: ['unknown', 'independent', 'owned'],
            description: 'Feature 19: Ownership status. "owned" = owned by the group, "independent" = free house, "unknown" = not yet checked.',
          },
        },
        required: ['venueId'],
      },
    },
    {
      name: 'delete_venue',
      description: 'Permanently delete a venue from BNDY. Use search_venue or get_by_id first to verify you have the correct venue ID.',
      inputSchema: {
        type: 'object',
        properties: {
          venueId: {
            type: 'string',
            description: 'Venue UUID to permanently delete',
          },
        },
        required: ['venueId'],
      },
    },
    {
      name: 'enrich_venue',
      description: 'Geocode/backfill an existing venue to add google_place_id and coordinates. Use this on legacy venues missing place_id to prevent duplicates when source-runner runs. Supports batch processing with an array of venueIds.',
      inputSchema: {
        type: 'object',
        properties: {
          venueId: {
            oneOf: [
              { type: 'string', description: 'Single venue UUID to enrich' },
              { type: 'array', items: { type: 'string' }, description: 'Array of venue UUIDs for batch enrichment' },
            ],
            description: 'Venue UUID(s) to geocode/backfill',
          },
          force: {
            type: 'boolean',
            description: 'If true, re-geocode even if venue already has google_place_id (default: false)',
          },
        },
        required: ['venueId'],
      },
    },
    {
      name: 'list_venue_groups',
      description: 'List every venue ownership group in BNDY. Call this BEFORE create_venue_group to avoid a duplicate. Groups represent brewery estates, pubcos, chains, and operators.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'create_venue_group',
      description: 'Create a venue ownership group. A venue has ONE owner group. Robinsons Brewery is a brewery. Amber Taverns is a pubco. Returns existing group on duplicate (idempotent).',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Group name (e.g., "Robinsons Brewery", "Amber Taverns")',
          },
          groupType: {
            type: 'string',
            enum: ['brewery', 'pubco', 'chain', 'operator'],
            description: 'Type of ownership. brewery = tied house estate, pubco = property company, chain = branded chain, operator = management company.',
          },
          website: {
            type: 'string',
            description: 'Group website URL (optional)',
          },
          facebookUrl: {
            type: 'string',
            description: 'Facebook page URL (optional)',
          },
          bio: {
            type: 'string',
            description: 'Short description (optional)',
          },
        },
        required: ['name', 'groupType'],
      },
    },
    {
      name: 'edit_event',
      description: 'Update an existing event in BNDY. Can modify artist, venue, title, date, time, description, ticket info, poster URL, etc. Use artistId to reassign events when merging duplicate artists.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Event UUID to update',
          },
          artistId: {
            type: 'string',
            description: 'New artist UUID to reassign event to (use search_artist to find correct artist first). Use this when merging duplicate artists.',
          },
          venueId: {
            type: 'string',
            description: 'New venue UUID to move event to (use search_venue to find correct venue first)',
          },
          title: {
            type: 'string',
            description: 'Event title',
          },
          date: {
            type: 'string',
            description: 'Event date in YYYY-MM-DD format',
          },
          startTime: {
            type: 'string',
            description: 'Start time in HH:MM format. Supply it ONLY from a source or from Jason. NEVER ask the user for it and NEVER invent one. To fix a wrong time, use the RUNBOOK 5.6 default: Fri/Sat 21:00, Sun 19:00, other weekdays 20:00, afternoon 14:00.',
          },
          endTime: {
            type: 'string',
            description: 'End time in HH:MM format',
          },
          description: {
            type: 'string',
            description: 'Event description',
          },
          ticketed: {
            type: 'boolean',
            description: 'Whether event requires tickets',
          },
          ticketUrl: {
            type: 'string',
            description: 'Ticket purchase URL',
          },
          ticketInformation: {
            type: 'string',
            description: 'Ticket information text',
          },
          price: {
            type: 'string',
            description: 'Ticket price (e.g., "£15", "Free")',
          },
          imageUrl: {
            type: 'string',
            description: 'Event poster URL (use upload_event_poster to upload first)',
          },
          eventUrl: {
            type: 'string',
            description: 'External event page URL',
          },
          notes: {
            type: 'string',
            description: 'Additional notes',
          },
          isPublic: {
            type: 'boolean',
            description: 'Whether event should appear on public Frontstage map',
          },
          isOpenMic: {
            type: 'boolean',
            description: 'Set or clear the open mic flag. The API keeps the paired type attribute ("open-mic"/"gig") in sync.',
          },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'External system name (e.g., "onthecasemusic", "songkick")' },
                id: { type: 'string', description: 'ID in the external system' },
              },
              required: ['source', 'id'],
            },
            description: 'External system references (additive merge by default)',
          },
          replaceExternalIds: {
            type: 'boolean',
            description: 'If true, replace all externalIds instead of merging (default: false)',
          },
          // Festival fields (Phase 1a)
          festivalId: {
            type: 'string',
            description: 'Links event to parent festival',
          },
          festivalName: {
            type: 'string',
            description: 'Denormalized festival name for display',
          },
          stageId: {
            type: 'string',
            description: 'Stage ID within festival',
          },
          billing: {
            type: 'string',
            enum: ['headline', 'special_guest', 'support', 'general', 'opener'],
            description: 'Billing tier for festival events',
          },
          billingOrder: {
            type: 'number',
            description: 'Sort order within billing tier (0 = top)',
          },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'delete_event',
      description: 'Permanently delete an event from BNDY. This REMOVES the event entirely (not marked as cancelled). Use search_event first to verify you have the correct event ID.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Event UUID to permanently delete',
          },
        },
        required: ['eventId'],
      },
    },
    {
      name: 'upload_event_poster',
      description: 'Upload an image to BNDY S3 bucket for an event or festival. Downloads from provided URL and uploads to S3. Use the returned s3Url with edit_event or edit_festival. Provide exactly one of eventId or festivalId.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Event UUID (mutually exclusive with festivalId)',
          },
          festivalId: {
            type: 'string',
            description: 'Festival UUID (mutually exclusive with eventId)',
          },
          imageUrl: {
            type: 'string',
            description: 'URL of the image to download and upload',
          },
          kind: {
            type: 'string',
            enum: ['poster', 'logo'],
            description: 'Image type: poster (default) or logo. Use logo for festival branding.',
          },
        },
        required: ['imageUrl'],
      },
    },
    {
      name: 'bulk_import',
      description: 'Bulk import structured data (artists, venues, events) into BNDY with automatic deduplication. Uses Google Places for venue matching and name matching for artists. Handles the entire import server-side to avoid timeouts. Supports dry-run mode to preview what would be imported.',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            description: 'The structured data to import',
            properties: {
              artists: {
                type: 'object',
                description: 'Map of localId -> artist data. Each artist should have: name, act_type, genres[], location{city,region}, urls[{kind,url}], bio',
              },
              venues: {
                type: 'object',
                description: 'Map of localId -> venue data. Each venue should have: name, location{town,region}, urls[{kind,url}]',
              },
              events: {
                type: 'object',
                description: 'Map of localId -> event data. Each event should have: artist_id (local), venue_id (local), date (YYYY-MM-DD), time (HH:MM optional), title (optional)',
              },
            },
          },
          locationContext: {
            type: 'string',
            description: 'Location context for Google Places searches (e.g., "Greater Manchester, UK"). Defaults to "Greater Manchester, UK"',
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, simulates the import without creating records. Use to preview what would be imported.',
          },
        },
        required: ['data'],
      },
    },
    {
      name: 'get_by_external_id',
      description: 'Look up a venue, artist, event, or festival by its external system reference. Use this to check if an entity already exists in BNDY before creating it, enabling idempotent imports across sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          entityType: {
            type: 'string',
            enum: ['venue', 'artist', 'event', 'festival'],
            description: 'Type of entity to look up',
          },
          source: {
            type: 'string',
            description: 'External system name (e.g., "onthecasemusic", "songkick", "bandsintown")',
          },
          id: {
            type: 'string',
            description: 'ID in the external system',
          },
        },
        required: ['entityType', 'source', 'id'],
      },
    },
    {
      name: 'get_by_id',
      description: 'Fetch full venue, artist, event, or festival record by bndy UUID. Returns ALL fields including externalIds, lineup, stages, etc. Use before edit_* to inspect current state for merge decisions.',
      inputSchema: {
        type: 'object',
        properties: {
          entityType: {
            type: 'string',
            enum: ['venue', 'artist', 'event', 'festival'],
            description: 'Type of entity to fetch',
          },
          id: {
            type: 'string',
            description: 'bndy UUID of the entity',
          },
        },
        required: ['entityType', 'id'],
      },
    },
    // Festival tools (Phase 1a - festival-mcp-write-api-spec §2)
    {
      name: 'create_festival',
      description: 'Create a new festival in BNDY. Search first with search_festival. A festival groups child events - it is not an event and never appears on the gig map itself. Festivals have lineup slots that resolve to artists/events across import runs.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Festival name (required)' },
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD (required)' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD (defaults to startDate)' },
          description: { type: 'string', description: 'Festival description' },
          primaryVenueId: { type: 'string', description: 'Primary venue UUID' },
          venueIds: { type: 'array', items: { type: 'string' }, description: 'All participating venue UUIDs' },
          stages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                venueId: { type: 'string' },
              },
            },
            description: 'Festival stages (server assigns IDs)',
          },
          lineup: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayName: { type: 'string', description: 'Act name as billed' },
                artistId: { type: 'string' },
                day: { type: 'string' },
                stageId: { type: 'string' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                billing: { type: 'string', enum: ['headline', 'special_guest', 'support', 'general', 'opener'] },
                billingOrder: { type: 'number' },
              },
            },
          },
          ticketed: { type: 'boolean' },
          price: { type: 'string', description: 'Price text (e.g., "FREE", "from £15")' },
          ticketUrl: { type: 'string' },
          lineupUrl: { type: 'string' },
          websiteUrl: { type: 'string' },
          posterImageUrl: { type: 'string' },
          heroImageUrl: { type: 'string' },
          theme: {
            type: 'object',
            properties: {
              primaryColor: { type: 'string' },
              secondaryColor: { type: 'string' },
              backgroundColor: { type: 'string' },
              foregroundColor: { type: 'string' },
            },
          },
          isPublic: { type: 'boolean', description: 'Default false - MUST pass true for public festivals' },
          externalIds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
        },
        required: ['name', 'startDate'],
      },
    },
    {
      name: 'edit_festival',
      description: 'Update an existing festival. externalIds are merged additively by default; set replaceExternalIds=true to replace. Slug is immutable.',
      inputSchema: {
        type: 'object',
        properties: {
          festivalId: { type: 'string', description: 'Festival UUID (required)' },
          name: { type: 'string' },
          description: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          primaryVenueId: { type: 'string' },
          venueIds: { type: 'array', items: { type: 'string' } },
          stages: { type: 'array', items: { type: 'object' } },
          ticketed: { type: 'boolean' },
          price: { type: 'string' },
          ticketUrl: { type: 'string' },
          lineupUrl: { type: 'string' },
          websiteUrl: { type: 'string' },
          posterImageUrl: { type: 'string' },
          heroImageUrl: { type: 'string' },
          theme: { type: 'object' },
          isPublic: { type: 'boolean' },
          externalIds: { type: 'array', items: { type: 'object' } },
          replaceExternalIds: { type: 'boolean', description: 'Replace all externalIds instead of merging' },
        },
        required: ['festivalId'],
      },
    },
    {
      name: 'search_festival',
      description: 'Search for festivals by name/town/dates. All params optional - supports town-only or date-window-only queries. Returns ALL matches. Dedup rule: same/near name + same town + overlapping dates = same festival; reuse it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Festival name to search (optional)' },
          town: { type: 'string', description: 'Town/city filter (optional)' },
          dateFrom: { type: 'string', description: 'Filter start date YYYY-MM-DD (optional)' },
          dateTo: { type: 'string', description: 'Filter end date YYYY-MM-DD (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'add_lineup_slot',
      description: 'Add lineup slots to a festival. Always import a full bill in ONE call. Server dedups on (displayName lowercased, day, stageId) - re-running import does not double the bill.',
      inputSchema: {
        type: 'object',
        properties: {
          festivalId: { type: 'string', description: 'Festival UUID (required)' },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayName: { type: 'string', description: 'Act name as billed (required)' },
                artistId: { type: 'string', description: 'Artist UUID if already resolved' },
                day: { type: 'string', description: 'Day YYYY-MM-DD' },
                stageId: { type: 'string' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                billing: { type: 'string', enum: ['headline', 'special_guest', 'support', 'general', 'opener'] },
                billingOrder: { type: 'number' },
              },
              required: ['displayName'],
            },
            description: 'Array of lineup slots to add',
          },
        },
        required: ['festivalId', 'slots'],
      },
    },
    {
      name: 'resolve_lineup_slot',
      description: 'Resolve a lineup slot to an artist and/or child event. Use as set times become available: crawl finds times → create child event → resolve slot. Set remove=true for acts that drop from the bill.',
      inputSchema: {
        type: 'object',
        properties: {
          festivalId: { type: 'string', description: 'Festival UUID (required)' },
          slotId: { type: 'string', description: 'Slot UUID (required)' },
          artistId: { type: 'string', description: 'Artist UUID when resolved' },
          eventId: { type: 'string', description: 'Child event UUID when created' },
          remove: { type: 'boolean', description: 'True to remove slot (act dropped from bill)' },
        },
        required: ['festivalId', 'slotId'],
      },
    },
    {
      name: 'delete_festival',
      description: 'Delete a festival. Requires the festival to have zero child events first; refuses with child count if not. Use search_event with festivalId to check for children before calling.',
      inputSchema: {
        type: 'object',
        properties: {
          festivalId: { type: 'string', description: 'Festival UUID to delete' },
        },
        required: ['festivalId'],
      },
    },
    // =========================================================================
    // CAPTURES TOOLS - Read/write mobile-captured content for processing
    // =========================================================================
    {
      name: 'list_captures',
      description: 'List captured content from mobile share intents. Use status filter to find unprocessed captures. Captures contain shared URLs/text from Facebook, web browsers, etc. that need to be processed into BNDY entities (events, venues, artists).',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['unprocessed', 'processing', 'processed', 'failed', 'ignored'],
            description: 'Filter by status (default: all). Use "unprocessed" to find captures needing attention.',
          },
          limit: {
            type: 'number',
            description: 'Max number of captures to return (default: 50)',
          },
        },
      },
    },
    {
      name: 'get_capture',
      description: 'Get a single capture by ID. Returns full details including sharedText, sharedUrl, sourceApp, and any notes.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Capture UUID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_capture_status',
      description: 'Update the status of a capture. Use after processing to mark as "processed", or "ignored" if not relevant, or "failed" if processing failed.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Capture UUID',
          },
          status: {
            type: 'string',
            enum: ['unprocessed', 'processing', 'processed', 'failed', 'ignored'],
            description: 'New status for the capture',
          },
        },
        required: ['id', 'status'],
      },
    },
    {
      name: 'add_capture_notes',
      description: 'Add notes to a capture. Use to record what was done with the capture (e.g., "Created event abc123", "Duplicate of existing event", "Not a gig listing").',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Capture UUID',
          },
          notes: {
            type: 'string',
            description: 'Notes to add to the capture',
          },
        },
        required: ['id', 'notes'],
      },
    },
    // =========================================================================
    // SOURCE RUNS TOOLS - Agent Work dashboard metrics
    // =========================================================================
    {
      name: 'record_run',
      description: 'Record a source run for the Agent Work dashboard. Call at start (status:started), end (status:completed), or on failure (status:failed). rawRows is REQUIRED for completed runs - it distinguishes "source published nothing" from "parse broke silently".',
      inputSchema: {
        type: 'object',
        properties: {
          sourceId: {
            type: 'string',
            description: 'Canonical source slug from RUNBOOK §6D table (e.g., "onthecasemusic", "songkick")',
          },
          runId: {
            type: 'string',
            description: 'Unique run identifier (e.g., "2026-08-07T04-30-00Z")',
          },
          runDate: {
            type: 'string',
            description: 'Run date in YYYY-MM-DD format',
          },
          status: {
            type: 'string',
            enum: ['started', 'completed', 'failed'],
            description: 'Run status: started (beginning), completed (success), failed (error)',
          },
          counts: {
            type: 'object',
            description: 'Run metrics (all optional numbers, zero-filled by API)',
            properties: {
              rawRows: { type: 'number', description: 'Rows captured from source (REQUIRED for completed runs)' },
              validEvents: { type: 'number', description: 'Rows surviving §0 filters' },
              parkedRows: { type: 'number', description: 'Rows skipped with reason' },
              eventsCreated: { type: 'number', description: 'Verified event creates' },
              venuesCreated: { type: 'number', description: 'Verified venue creates' },
              artistsCreated: { type: 'number', description: 'Verified artist creates' },
              venuesMatched: { type: 'number', description: 'Existing venues reused' },
              artistsMatched: { type: 'number', description: 'Existing artists reused' },
              eventsDeleted: { type: 'number', description: '§0.17 deletes' },
              eventsHidden: { type: 'number', description: '§0.17 hidden' },
              cancelled: { type: 'number', description: '§0.17 cancellations' },
              pastDropped: { type: 'number', description: '§0.17 past events dropped' },
              reviewItems: { type: 'number', description: 'Items raised for review' },
            },
          },
          note: {
            type: 'string',
            description: 'Human-readable summary (max 200 chars)',
          },
          reportPath: {
            type: 'string',
            description: 'Vault path to full RUN-REPORT.md',
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
              },
              required: ['message'],
            },
            description: 'Error details for failed runs',
          },
        },
        required: ['sourceId', 'runId', 'runDate', 'status', 'counts'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_venue':
        const venueSearchResult = await searchVenue(args as any);
        return {
          content: [
            {
              type: 'text',
              text: venueSearchResult,
            },
          ],
        };

      case 'create_venue':
        const venueCreateResult = await createVenue(args as any);
        return {
          content: [
            {
              type: 'text',
              text: venueCreateResult,
            },
          ],
        };

      case 'search_artist':
        const artistSearchResult = await searchArtist(args as any);
        return {
          content: [
            {
              type: 'text',
              text: artistSearchResult,
            },
          ],
        };

      case 'create_artist':
        const artistCreateResult = await createArtist(args as any);
        return {
          content: [
            {
              type: 'text',
              text: artistCreateResult,
            },
          ],
        };

      case 'create_event':
        const eventCreateResult = await createEvent(args as any);
        return {
          content: [
            {
              type: 'text',
              text: eventCreateResult,
            },
          ],
        };

      case 'edit_artist':
        const artistEditResult = await editArtist(args as any);
        return {
          content: [
            {
              type: 'text',
              text: artistEditResult,
            },
          ],
        };

      case 'delete_artist':
        const artistDeleteResult = await deleteArtist(args as any);
        return {
          content: [
            {
              type: 'text',
              text: artistDeleteResult,
            },
          ],
        };

      case 'list_artists':
        const listArtistsResult = await listArtists(args as any);
        return {
          content: [
            {
              type: 'text',
              text: listArtistsResult,
            },
          ],
        };

      case 'list_venues':
        const listVenuesResult = await listVenues(args as any);
        return {
          content: [
            {
              type: 'text',
              text: listVenuesResult,
            },
          ],
        };

      case 'edit_venue':
        const venueEditResult = await editVenue(args as any);
        return {
          content: [
            {
              type: 'text',
              text: venueEditResult,
            },
          ],
        };

      case 'delete_venue':
        const venueDeleteResult = await deleteVenue(args as any);
        return {
          content: [
            {
              type: 'text',
              text: venueDeleteResult,
            },
          ],
        };

      case 'enrich_venue':
        const venueEnrichResult = await enrichVenue(args as any);
        return {
          content: [
            {
              type: 'text',
              text: venueEnrichResult,
            },
          ],
        };

      case 'list_venue_groups':
        const listGroupsResult = await listVenueGroups();
        return {
          content: [
            {
              type: 'text',
              text: listGroupsResult,
            },
          ],
        };

      case 'create_venue_group':
        const createGroupResult = await createVenueGroup(args as any);
        return {
          content: [
            {
              type: 'text',
              text: createGroupResult,
            },
          ],
        };

      case 'edit_event':
        const eventEditResult = await editEvent(args as any);
        return {
          content: [
            {
              type: 'text',
              text: eventEditResult,
            },
          ],
        };

      case 'delete_event':
        const eventDeleteResult = await deleteEvent(args as any);
        return {
          content: [
            {
              type: 'text',
              text: eventDeleteResult,
            },
          ],
        };

      case 'search_event':
        const eventSearchResult = await searchEvent(args as any);
        return {
          content: [
            {
              type: 'text',
              text: eventSearchResult,
            },
          ],
        };

      case 'upload_event_poster':
        const uploadResult = await uploadEventPoster(args as any);
        return {
          content: [
            {
              type: 'text',
              text: uploadResult,
            },
          ],
        };

      case 'bulk_import':
        const bulkImportResult = await bulkImport(args as any);
        return {
          content: [
            {
              type: 'text',
              text: bulkImportResult,
            },
          ],
        };

      case 'get_by_external_id':
        const lookupResult = await getByExternalId(args as any);
        return {
          content: [
            {
              type: 'text',
              text: lookupResult,
            },
          ],
        };

      case 'get_by_id':
        const getByIdResult = await getById(args as any);
        return {
          content: [
            {
              type: 'text',
              text: getByIdResult,
            },
          ],
        };

      // Festival tools (Phase 1a)
      case 'create_festival':
        const festivalCreateResult = await createFestival(args as any);
        return {
          content: [
            {
              type: 'text',
              text: festivalCreateResult,
            },
          ],
        };

      case 'edit_festival':
        const festivalEditResult = await editFestival(args as any);
        return {
          content: [
            {
              type: 'text',
              text: festivalEditResult,
            },
          ],
        };

      case 'search_festival':
        const festivalSearchResult = await searchFestival(args as any);
        return {
          content: [
            {
              type: 'text',
              text: festivalSearchResult,
            },
          ],
        };

      case 'add_lineup_slot':
        const lineupSlotResult = await addLineupSlot(args as any);
        return {
          content: [
            {
              type: 'text',
              text: lineupSlotResult,
            },
          ],
        };

      case 'resolve_lineup_slot':
        const resolveSlotResult = await resolveLineupSlot(args as any);
        return {
          content: [
            {
              type: 'text',
              text: resolveSlotResult,
            },
          ],
        };

      case 'delete_festival':
        const deleteFestivalResult = await deleteFestival(args as any);
        return {
          content: [
            {
              type: 'text',
              text: deleteFestivalResult,
            },
          ],
        };

      // Captures tools
      case 'list_captures':
        const listCapturesResult = await listCaptures(args as any);
        return {
          content: [
            {
              type: 'text',
              text: listCapturesResult,
            },
          ],
        };

      case 'get_capture':
        const getCaptureResult = await getCapture(args as any);
        return {
          content: [
            {
              type: 'text',
              text: getCaptureResult,
            },
          ],
        };

      case 'update_capture_status':
        const updateCaptureStatusResult = await updateCaptureStatus(args as any);
        return {
          content: [
            {
              type: 'text',
              text: updateCaptureStatusResult,
            },
          ],
        };

      case 'add_capture_notes':
        const addCaptureNotesResult = await addCaptureNotes(args as any);
        return {
          content: [
            {
              type: 'text',
              text: addCaptureNotesResult,
            },
          ],
        };

      // Source runs tools
      case 'record_run':
        const recordRunResult = await recordRun(args as any);
        return {
          content: [
            {
              type: 'text',
              text: recordRunResult,
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`Error in tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BNDY MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
