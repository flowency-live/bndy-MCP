// Create/Resolve Artist Tool - MCP Implementation
// BUILD-008 G2: delegates to server-side POST /api/artists/find-or-create (the ADR-014 gate:
// normalise -> identical-slug or >=90%+shared-token = MATCH; >=60% = REVIEW; else CREATE with
// needs_review).
//
// 2026-07-27 AUDIT FIX F1: the old 404-fallback to /api/artists/community is
// DELETED. That route has no dedup, and the fallback (a substring test on the
// error message) is what created a duplicate artist per import attempt while
// find-or-create was missing from the deployed API. This tool now FAILS
// CLOSED: if the resolver is unreachable, no artist is created, ever.

import { apiRequest, ApiError } from '../utils/http-client.js';
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
  nameVariants?: string[];
  actType?: Array<'originals' | 'covers' | 'tribute'>;
  // Resolution params (Blocker #1 fix): use these when action:review was returned
  resolveTo?: string; // Candidate id from review response - link to that existing artist
  confirmNew?: boolean; // Confirm this is genuinely new despite shared tokens
  // §2A.5 exception (Blocker #2 fix): for acts whose FB page name IS their billing
  verifiedSourceName?: boolean; // Asserts name is verbatim from act's own page
}

export async function createArtist(params: CreateArtistParams): Promise<string> {
  const { name, artistType, location, locationType, bio, profileImageUrl, genres, facebookUrl, instagramUrl, spotifyUrl, externalIds, nameVariants, actType, resolveTo, confirmNew, verifiedSourceName } = params;

  // Log resolution mode if applicable
  if (resolveTo) {
    console.error(`[create_artist] RESOLVE_TO: linking "${name}" to existing artist ${resolveTo}`);
  } else if (confirmNew) {
    console.error(`[create_artist] CONFIRM_NEW: creating "${name}" despite potential matches`);
  } else {
    console.error(`[create_artist] find-or-create artist "${name}" (${artistType})`);
  }

  try {
    const normalizedExternalIds = normalizeExternalIds(externalIds || []);

    const artistData = {
      name,
      artist_type: artistType,
      location, // Required for the create path
      ...(locationType && { locationType }),
      bio: bio || '',
      profileImageUrl: profileImageUrl || '',
      genres: genres || [],
      facebookUrl: facebookUrl || '',
      instagramUrl: instagramUrl || '',
      spotifyUrl: spotifyUrl || '',
      externalIds: normalizedExternalIds,
      // Identity resolution: these feed buildArtistUniqueKeys server-side (handler.js:2091),
      // so they must be supplied AT CREATE or the dedup sentinel for the alias is never written.
      ...(nameVariants?.length ? { nameVariants } : {}),
      ...(actType?.length ? { actType } : {}),
      // AI creation flags (CRITICAL for the review queue)
      ai_created: true,
      source: 'mcp_ai_import',
      // Resolution params (when retrying after action:review)
      ...(resolveTo && { resolveTo }),
      ...(confirmNew && { confirmNew: true }),
      // §2A.5 exception for verbatim page names
      ...(verifiedSourceName && { verifiedSourceName: true })
    };

    // BUILD-008 G2 + 2026-07-27 F1: server-side resolution gate, FAIL CLOSED.
    // No fallback route exists any more — if this endpoint is unreachable the
    // import must stop, not blind-create.
    const response = await apiRequest<any>('/api/artists/find-or-create', 'POST', artistData);

    const action = response.action;

    if (action === 'matched') {
      console.error(`[create_artist] matched existing artist: ${response.artist?.id}`);
      return JSON.stringify({
        success: true,
        action: 'matched',
        artist: { id: response.artist.id, name: response.artist.name },
        confidence: response.confidence,
        matchedBy: response.matchedBy,
        message: `Matched existing artist "${response.artist.name}" - no duplicate created. Use this id for the event.`,
      }, null, 2);
    }

    if (action === 'review') {
      const candidates = response.candidates || [];
      console.error(`[create_artist] ambiguous -> review (${candidates.length} candidate(s))`);
      return JSON.stringify({
        success: true,
        action: 'review',
        candidates,
        message: `Ambiguous match for "${name}" - needs resolution. To resolve: (1) If one candidate is correct, retry with resolveTo: "<candidate-id>". (2) If none match and this is genuinely new, retry with confirmNew: true. Candidates: ${candidates.map((c: any) => `${c.name} (${c.location || 'no location'}, ${Math.round((c.confidence || 0) * 100)}%)`).join('; ') || 'none'}`,
      }, null, 2);
    }

    // action === 'created' (genuine no-hit)
    console.error(`[create_artist] created new artist: ${response.artist?.id}`);
    return JSON.stringify({
      success: true,
      action: 'created',
      artist: { id: response.artist.id, name: response.artist.name, artistType, aiCreated: true, needsReview: true },
      message: `Artist "${name}" created (no existing match). Flagged for manual review.`,
    }, null, 2);

  } catch (error: any) {
    console.error(`[create_artist] Error:`, error);

    // Server hard-gate bounce: an artist with this name+region (or this
    // Facebook page) already exists. This is a MATCH signal, not a failure.
    if (error instanceof ApiError && error.isDuplicate) {
      const existingId = error.body?.existingArtistId || error.body?.existingId || null;
      return JSON.stringify({
        success: false,
        action: 'duplicate',
        error: 'DUPLICATE_ARTIST',
        existingArtistId: existingId,
        message: existingId
          ? `The backend uniqueness gate bounced this create: an artist with this name already exists in this region (id: ${existingId}). USE THE EXISTING RECORD — do not retry the create or vary the name to get around the gate.`
          : 'The backend uniqueness gate bounced this create: an artist with this name already exists in this region. Use search_artist (minConfidence 25) to find it and reuse its id.',
      }, null, 2);
    }

    if (error instanceof ApiError && error.status === 404) {
      return JSON.stringify({
        success: false,
        error: 'RESOLVER_UNAVAILABLE',
        message: 'POST /api/artists/find-or-create is not reachable (404). FAIL CLOSED: no artist was created. Do NOT work around this — report it and stop the import.',
      }, null, 2);
    }

    if (error instanceof ApiError && error.body?.code === 'LOCATION_UNRESOLVABLE') {
      return JSON.stringify({
        success: false,
        action: 'review',
        error: 'LOCATION_UNRESOLVABLE',
        message: error.body.error || 'Location could not be resolved to a region. Supply a real town/county — artist identity requires it.',
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: error.message,
      message: 'Failed to find-or-create artist. No artist was created (fail closed).',
    }, null, 2);
  }
}
