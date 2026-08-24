import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const endpoint = process.env.MCP_ENDPOINT;
const token = process.env.MCP_TOKEN;

if (!endpoint) throw new Error('MCP_ENDPOINT is required');
if (!token) throw new Error('MCP_TOKEN is required');

const authenticatedFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  fetch: authenticatedFetch,
});
const client = new Client({ name: 'bndy-live-acceptance', version: '1.0.0' });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'create_artist',
    'create_event',
    'create_venue',
    'search_artist',
    'search_venue',
  ]);

  const venueSearch = await client.callTool({
    name: 'search_venue',
    arguments: { name: 'Sugarmill', city: 'Stoke-on-Trent' },
  });

  assert.notEqual(venueSearch.isError, true, 'search_venue returned an MCP tool error');
  const textPart = venueSearch.content.find((part) => part.type === 'text');
  assert.ok(textPart && textPart.type === 'text', 'search_venue returned no text result');

  const payload = JSON.parse(textPart.text);
  assert.equal(payload.operation, 'search_venue');
  assert.equal(payload.ok, true, 'BNDY production API search failed through MCP');
  assert.equal(payload.httpStatus, 200);

  console.log(JSON.stringify({
    liveMcpAcceptance: 'success',
    toolCount: names.length,
    searchVenueHttpStatus: payload.httpStatus,
  }));
} finally {
  await client.close();
}
