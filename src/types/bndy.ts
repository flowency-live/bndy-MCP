// BNDY Type Definitions for MCP Server

export interface ExternalId {
  source: string;  // e.g., "onthecasemusic", "songkick", "bandsintown"
  id: string;      // The ID in that external system
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  externalIds?: ExternalId[];
  ai_created?: boolean;
  needs_review?: boolean;
  created_source?: string;
}

export interface Artist {
  id: string;
  name: string;
  artist_type: 'band' | 'solo' | 'duo' | 'dj' | 'other';
  genres?: string[];
  facebook_url?: string;
  instagram_url?: string;
  spotify_url?: string;
  externalIds?: ExternalId[];
  ai_created?: boolean;
  needs_review?: boolean;
  source?: string;
}

export interface Event {
  id: string;
  artistId: string;
  venueId?: string;
  type: 'gig' | 'public_gig' | 'practice' | 'recording' | 'other';
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  title?: string;
  isPublic: boolean;
  externalIds?: ExternalId[];
  source?: string;
}

export interface VenueSearchResult extends Venue {
  confidence?: number;
  matchMethod?: string;
}

export interface ArtistSearchResult extends Artist {
  confidence?: number;
}
