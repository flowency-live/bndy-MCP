import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

interface Env {
  BNDY_API_BASE_URL: string;
  BNDY_MCP_SERVICE_TOKEN: string;
  BNDY_REMOTE_MCP_TOKEN: string;
}

interface ApiResult {
  ok: boolean;
  status: number;
  data: unknown;
}

const externalIdSchema = z.object({
  source: z.string().min(1).describe('Source system, e.g. facebook, lemonrock, allevents'),
  id: z.string().min(1).describe('Stable identifier in the source system'),
});

function jsonToolResult(operation: string, result: ApiResult) {
  const payload = {
    operation,
    ok: result.ok,
    httpStatus: result.status,
    result: result.data,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    ...(result.ok ? {} : { isError: true }),
  };
}

function exceptionToolResult(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ operation, ok: false, error: message }, null, 2),
    }],
    isError: true,
  };
}

async function bndyRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult> {
  const base = env.BNDY_API_BASE_URL.replace(/\/+$/, '');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${env.BNDY_MCP_SERVICE_TOKEN}`);

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { ok: response.ok, status: response.status, data };
}

function similarity(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  const matrix: number[][] = Array.from(
    { length: right.length + 1 },
    (_, i) => Array(left.length + 1).fill(0).map((__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= right.length; i += 1) {
    for (let j = 1; j <= left.length; j += 1) {
      matrix[i][j] = right[i - 1] === left[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }

  const maxLength = Math.max(left.length, right.length);
  return maxLength === 0 ? 100 : Math.round(((maxLength - matrix[right.length][left.length]) / maxLength) * 100);
}

function buildServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'bndy',
    version: '1.0.0',
  });

  server.registerTool(
    'search_venue',
    {
      title: 'Search BNDY venues',
      description: 'Search the live BNDY venue database before creating or linking a gig. Returns BNDY venue IDs and confidence-ranked matches.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Venue name'),
        city: z.string().min(1).optional().describe('Town or city used to narrow the result'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name, city }) => {
      try {
        const response = await bndyRequest(env, `/api/venues?search=${encodeURIComponent(name)}`);
        if (!response.ok || !Array.isArray(response.data)) return jsonToolResult('search_venue', response);

        const cityNeedle = city?.toLowerCase().trim();
        const matches = response.data
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .filter((venue) => {
            if (!cityNeedle) return true;
            const haystack = `${String(venue.city ?? '')} ${String(venue.address ?? '')}`.toLowerCase();
            return haystack.includes(cityNeedle);
          })
          .map((venue) => ({
            id: venue.id,
            name: venue.name,
            city: venue.city,
            address: venue.address,
            postcode: venue.postcode,
            latitude: venue.latitude,
            longitude: venue.longitude,
            googlePlaceId: venue.googlePlaceId,
            externalIds: venue.externalIds ?? [],
            confidence: similarity(name, String(venue.name ?? '')),
          }))
          .sort((a, b) => b.confidence - a.confidence);

        return jsonToolResult('search_venue', {
          ok: true,
          status: 200,
          data: { found: matches.length > 0, count: matches.length, matches },
        });
      } catch (error) {
        return exceptionToolResult('search_venue', error);
      }
    },
  );

  server.registerTool(
    'create_venue',
    {
      title: 'Find or create BNDY venue',
      description: 'Safely find or create a BNDY venue. The BNDY venue Lambda remains authoritative: it resolves Google Places, validates that the venue is a fixed building, deduplicates by Place ID/location/name/address, and enforces the database uniqueness gate.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Venue name'),
        city: z.string().min(1).describe('Town or city'),
        address: z.string().min(1).optional().describe('Street address or postcode. Strongly preferred because it pins Google Places resolution to the correct building.'),
        facebookUrl: z.string().url().optional(),
        website: z.string().url().optional(),
        googlePlaceId: z.string().min(1).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        externalIds: z.array(externalIdSchema).optional(),
        publicationScopes: z.array(z.string().min(1)).optional(),
        discoveryScopes: z.array(z.string().min(1)).optional(),
        venueKind: z.string().min(1).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const body = {
          ...args,
          socialMediaUrls: args.facebookUrl ? [args.facebookUrl] : undefined,
          ai_created: true,
          needs_review: true,
          created_source: 'mcp_ai_import',
          source: 'mcp_ai_import',
        };
        const result = await bndyRequest(env, '/api/venues/find-or-create/mcp', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return jsonToolResult('create_venue', result);
      } catch (error) {
        return exceptionToolResult('create_venue', error);
      }
    },
  );

  server.registerTool(
    'search_artist',
    {
      title: 'Search BNDY artists',
      description: 'Search BNDY artist identity records using the server-side artist search used for duplicate prevention. Returns BNDY artist IDs for linking gigs.',
      inputSchema: z.object({
        name: z.string().min(2).describe('Artist or act name'),
        location: z.string().min(1).optional().describe('Performing location, town, county or region'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name, location }) => {
      try {
        const query = new URLSearchParams({ name });
        if (location) query.set('location', location);
        const result = await bndyRequest(env, `/api/artists/search?${query.toString()}`);
        return jsonToolResult('search_artist', result);
      } catch (error) {
        return exceptionToolResult('search_artist', error);
      }
    },
  );

  server.registerTool(
    'create_artist',
    {
      title: 'Find or create BNDY artist',
      description: 'Resolve an artist against BNDY and create only when the BNDY identity resolver considers it safe. Ambiguous identities return a review action and candidates rather than silently creating a duplicate. The hard name+performing-region/Facebook uniqueness gate remains authoritative.',
      inputSchema: z.object({
        name: z.string().min(1),
        artistType: z.enum(['band', 'solo', 'duo', 'dj', 'other']),
        location: z.string().min(1).describe('Performing location. Required by BNDY artist identity rules.'),
        locationType: z.string().min(1).optional(),
        locationLat: z.number().optional(),
        locationLng: z.number().optional(),
        actType: z.string().min(1).optional(),
        acoustic: z.boolean().optional(),
        genres: z.array(z.string().min(1)).optional(),
        bio: z.string().optional(),
        facebookUrl: z.string().url().optional(),
        instagramUrl: z.string().url().optional(),
        websiteUrl: z.string().url().optional(),
        spotifyUrl: z.string().url().optional(),
        profileImageUrl: z.string().url().optional(),
        externalIds: z.array(externalIdSchema).optional(),
        nameVariants: z.array(z.string().min(1)).optional(),
        verifiedSourceName: z.boolean().optional().describe('Set only when the supplied name was verified on the artist own source page.'),
        canCreate: z.boolean().optional().describe('Defaults true. Set false for resolution-only behaviour.'),
        resolveTo: z.string().uuid().optional().describe('Resolve a previous review result to an existing BNDY artist ID.'),
        confirmNew: z.boolean().optional().describe('Use only after reviewing ambiguous candidates and independently confirming this is genuinely a different artist.'),
        publicationScopes: z.array(z.string().min(1)).optional(),
        discoveryScopes: z.array(z.string().min(1)).optional(),
        performerKind: z.string().min(1).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const body = {
          ...args,
          artist_type: args.artistType,
          source: 'mcp_ai_import',
          ai_created: true,
          needs_review: true,
        };
        const result = await bndyRequest(env, '/api/artists/find-or-create/mcp', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return jsonToolResult('create_artist', result);
      } catch (error) {
        return exceptionToolResult('create_artist', error);
      }
    },
  );

  server.registerTool(
    'create_event',
    {
      title: 'Create BNDY gig',
      description: 'Create a gig/open-mic event linked to existing BNDY venue and artist IDs. The production event Lambda checks external IDs and artist+venue+date uniqueness before writing and reads the record back consistently to verify persistence.',
      inputSchema: z.object({
        artistId: z.string().uuid().optional().describe('Single artist ID. Use artistIds for multi-artist gigs.'),
        artistIds: z.array(z.string().uuid()).min(1).optional(),
        venueId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('HH:MM, 24-hour clock'),
        startTimeDefaulted: z.boolean().optional().describe('True when startTime was deliberately defaulted because the source did not state a time.'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        title: z.string().min(1).optional(),
        isPublic: z.boolean().optional().describe('Production API defaults to true when omitted.'),
        isOpenMic: z.boolean().optional(),
        externalIds: z.array(externalIdSchema).optional(),
        price: z.string().optional(),
        eventUrl: z.string().url().optional(),
        ticketed: z.boolean().optional(),
        ticketInformation: z.string().optional(),
        ticketUrl: z.string().url().optional(),
        imageUrl: z.string().url().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        festivalId: z.string().optional(),
        festivalName: z.string().optional(),
        stageId: z.string().optional(),
        billing: z.string().optional(),
        billingOrder: z.number().int().optional(),
        publicationScopes: z.array(z.string().min(1)).optional(),
        eventKind: z.string().min(1).optional(),
        productionId: z.string().optional(),
        productionName: z.string().optional(),
        conductorName: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const body = {
          ...args,
          source: 'mcp_ai_import',
        };
        const result = await bndyRequest(env, '/api/events/community/mcp', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return jsonToolResult('create_event', result);
      } catch (error) {
        return exceptionToolResult('create_event', error);
      }
    },
  );

  return server;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get('Authorization');
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function secureEquals(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);

  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

function configurationReady(env: Env): boolean {
  return Boolean(env.BNDY_API_BASE_URL && env.BNDY_MCP_SERVICE_TOKEN && env.BNDY_REMOTE_MCP_TOKEN);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json(
        { service: 'bndy-remote-mcp', status: configurationReady(env) ? 'ok' : 'not_configured' },
        { status: configurationReady(env) ? 200 : 503 },
      );
    }

    if (url.pathname !== '/mcp') {
      return new Response('Not found', { status: 404 });
    }

    if (!configurationReady(env)) {
      return Response.json({ error: 'BNDY remote MCP is not configured' }, { status: 503 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    const token = bearerToken(request);
    if (!token || !(await secureEquals(token, env.BNDY_REMOTE_MCP_TOKEN))) {
      return Response.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer realm="bndy-mcp"' },
        },
      );
    }

    const handler = createMcpHandler(() => buildServer(env));
    return handler.fetch(request);
  },
};
