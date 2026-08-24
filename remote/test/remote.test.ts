import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import remoteApp from '../src/index.js';

const env = {
  BNDY_API_BASE_URL: 'https://api.test.bndy',
  BNDY_MCP_SERVICE_TOKEN: 'backend-service-token',
  BNDY_REMOTE_MCP_TOKEN: 'remote-client-token',
};

function authenticatedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${env.BNDY_REMOTE_MCP_TOKEN}`);
  return remoteApp.fetch(new Request(input, { ...init, headers }), env);
}

test('health is public but MCP requires the remote bearer token', async () => {
  const health = await remoteApp.fetch(new Request('https://mcp.test/health'), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { service: 'bndy-remote-mcp', status: 'ok' });

  const unauthorized = await remoteApp.fetch(
    new Request('https://mcp.test/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    }),
    env,
  );

  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get('www-authenticate') ?? '', /Bearer/);
});

test('a real MCP client discovers the five intended tools through the stateless HTTP endpoint', async () => {
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: authenticatedFetch,
  });
  const client = new Client({ name: 'bndy-integration-test', version: '1.0.0' });

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

    const annotations = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool.annotations]));
    assert.equal(annotations.search_venue?.readOnlyHint, true);
    assert.equal(annotations.search_artist?.readOnlyHint, true);
    assert.equal(annotations.create_venue?.destructiveHint, false);
    assert.equal(annotations.create_artist?.destructiveHint, false);
    assert.equal(annotations.create_event?.destructiveHint, false);
  } finally {
    await client.close();
  }
});

test('search_venue delegates to the BNDY API with only the backend service credential', async () => {
  const originalFetch = globalThis.fetch;
  let backendRequest: Request | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    backendRequest = request;

    return Response.json([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'The Sugarmill',
        city: 'Stoke-on-Trent',
        address: '36 Brunswick Street, Stoke-on-Trent',
        postcode: 'ST1 1DR',
      },
    ]);
  }) as typeof fetch;

  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
    fetch: authenticatedFetch,
  });
  const client = new Client({ name: 'bndy-integration-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'search_venue',
      arguments: { name: 'Sugarmill', city: 'Stoke-on-Trent' },
    });

    assert.ok(backendRequest);
    assert.equal(backendRequest.headers.get('Authorization'), 'Bearer backend-service-token');
    assert.equal(backendRequest.headers.get('Accept'), 'application/json');
    assert.equal(new URL(backendRequest.url).pathname, '/api/venues');
    assert.equal(new URL(backendRequest.url).searchParams.get('search'), 'Sugarmill');
    assert.notEqual(backendRequest.headers.get('Authorization'), `Bearer ${env.BNDY_REMOTE_MCP_TOKEN}`);

    assert.equal(result.isError, undefined);
    const textPart = result.content.find((part) => part.type === 'text');
    assert.ok(textPart && textPart.type === 'text');
    const payload = JSON.parse(textPart.text);
    assert.equal(payload.operation, 'search_venue');
    assert.equal(payload.ok, true);
    assert.equal(payload.result.found, true);
    assert.equal(payload.result.count, 1);
    assert.equal(payload.result.matches[0].name, 'The Sugarmill');
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
  }
});
