// Search Artist Tool - MCP Implementation (FIXED)
// Searches BNDY artists database by name and optional region

import { apiRequest } from '../utils/http-client.js';
import { ArtistSearchResult } from '../types/bndy.js';

interface SearchArtistParams {
  name: string;
  region?: string;
  limit?: number;        // Max results (default 20, max 50, 0=unlimited)
  minConfidence?: number; // Min confidence threshold (default 50)
}

interface SearchMatch {
  id: string;
  name: string;
  location: string;
  profileImageUrl: string | null;
  matchScore: number;
}

interface SearchResponse {
  matches: SearchMatch[];
}

export async function searchArtist(params: SearchArtistParams): Promise<string> {
  const { name, region } = params;

  // Apply defaults and constraints
  const limit = params.limit === 0 ? Infinity : Math.min(params.limit ?? 20, 50);
  const minConfidence = params.minConfidence ?? 50;

  console.error(`[search_artist] Searching for "${name}"${region ? ` in region "${region}"` : ''} (limit=${limit === Infinity ? 'unlimited' : limit}, minConfidence=${minConfidence})`);

  try {
    // Call BNDY API to search artists
    const searchUrl = `/api/artists?search=${encodeURIComponent(name)}${region ? `&location=${encodeURIComponent(region)}` : ''}`;
    const artists = await apiRequest<any[]>(searchUrl, 'GET');

    console.error(`[search_artist] API returned ${artists.length} artists`);

    // Normalize query for pre-filtering
    const normalizedQuery = normalizeName(name);
    const queryTokens = new Set(normalizedQuery.split(/\s+/).filter(t => t.length > 1));

    // Pre-filter: only keep artists whose normalized name has meaningful overlap with query
    // (substring match OR at least one shared token of length > 2)
    const preFiltered = artists.filter(artist => {
      const normalizedArtist = normalizeName(artist.name);
      // Substring match (either direction)
      if (normalizedArtist.includes(normalizedQuery) || normalizedQuery.includes(normalizedArtist)) {
        return true;
      }
      // Token overlap (at least one meaningful shared token)
      const artistTokens = normalizedArtist.split(/\s+/).filter(t => t.length > 2);
      return artistTokens.some(t => queryTokens.has(t) || [...queryTokens].some(qt => t.includes(qt) || qt.includes(t)));
    });

    // Hard filter by region if specified (unknown/empty locations pass through)
    const regionFiltered = region
      ? preFiltered.filter(artist => {
          if (!artist.location) return true; // Unknown location passes through
          return artist.location.toLowerCase().includes(region.toLowerCase());
        })
      : preFiltered;

    console.error(`[search_artist] After pre-filter: ${preFiltered.length}, after region filter: ${regionFiltered.length}`);

    if (regionFiltered.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No artists found matching "${name}"${region ? ` in ${region}` : ''}`,
        searchedName: name,
        totalScanned: artists.length
      }, null, 2);
    }

    // Score and transform results
    const results: ArtistSearchResult[] = regionFiltered.map(artist => {
      const nameSimilarity = calculateSimilarity(name, artist.name);
      return {
        id: artist.id,
        name: artist.name,
        artist_type: artist.artistType || artist.artist_type || 'band',
        location: artist.location,
        profileImageUrl: artist.profileImageUrl,
        externalIds: artist.externalIds || [],
        confidence: Math.round(nameSimilarity)
      };
    });

    // Sort by confidence (highest first)
    results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Apply min_confidence filter
    const confidenceFiltered = results.filter(r => (r.confidence || 0) >= minConfidence);

    // Apply limit
    const limited = limit === Infinity ? confidenceFiltered : confidenceFiltered.slice(0, limit);

    if (limited.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No artists found matching "${name}"${region ? ` in ${region}` : ''} above ${minConfidence}% confidence`,
        searchedName: name,
        totalScanned: artists.length,
        belowThreshold: results.length
      }, null, 2);
    }

    // Return formatted results
    return JSON.stringify({
      found: true,
      count: limited.length,
      matches: limited,
      totalScanned: artists.length,
      filteredOut: results.length - limited.length,
      recommendation: limited[0].confidence! >= 80
        ? `High confidence match: "${limited[0].name}" (${limited[0].confidence}% match score)`
        : `Found ${limited.length} possible match(es). Top match: "${limited[0].name}" (${limited[0].confidence}% match score). Review carefully before using.`
    }, null, 2);

  } catch (error: any) {
    console.error(`[search_artist] Error:`, error);
    return JSON.stringify({
      found: false,
      error: error.message,
      message: 'Failed to search artists'
    }, null, 2);
  }
}

// Normalize name for comparison: lowercase, strip "the ", remove punctuation
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

// Calculate string similarity percentage using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return ((maxLength - distance) / maxLength) * 100;
}

// Levenshtein distance algorithm
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
