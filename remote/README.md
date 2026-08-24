# BNDY Remote MCP

Remote, authenticated MCP facade for BNDY record creation.

This service is deliberately thin. It does **not** receive AWS, DynamoDB or Lambda permissions. It calls the existing production API at `https://api.bndy.co.uk` using the existing MCP service credential, so BNDY's production validation, deduplication and uniqueness gates remain authoritative.

The existing root MCP server remains the local/stdio implementation. This directory is isolated so remote MCP can use the current MCP v2 SDK without forcing a migration of the local server.

## Exposed tools

- `search_venue` - read only
- `create_venue` - find-or-create through `/api/venues/find-or-create/mcp`
- `search_artist` - read only
- `create_artist` - resolve/find-or-create through `/api/artists/find-or-create/mcp`
- `create_event` - create through `/api/events/community/mcp`

No edit or delete tools are exposed in the first remote release.

## Security model

There are two separate bearer credentials:

1. `BNDY_REMOTE_MCP_TOKEN` authenticates MCP clients to this Worker.
2. `BNDY_MCP_SERVICE_TOKEN` authenticates the Worker to BNDY's production API.

They must be different. A compromised client credential therefore does not expose the credential used by the production API. Neither secret is stored in this repository.

The backend service token already exists in AWS Secrets Manager as the secret consumed by the BNDY Lambda MCP routes. Copy it into the Worker secret store through an authenticated operator session; do not paste it into chat, source control or CI logs.

## Local checks

```bash
cd remote
npm install
npm run check
npm run build:dry
```

## Cloudflare deployment

Authenticate Wrangler to the BNDY Cloudflare account, then set secrets interactively:

```bash
cd remote
npx wrangler secret put BNDY_REMOTE_MCP_TOKEN
npx wrangler secret put BNDY_MCP_SERVICE_TOKEN
npm run deploy
```

`BNDY_API_BASE_URL` defaults to `https://api.bndy.co.uk` in `wrangler.jsonc`.

After deployment:

- health: `GET /health`
- MCP endpoint: `/mcp`
- MCP requests require `Authorization: Bearer <BNDY_REMOTE_MCP_TOKEN>`

Use a long, randomly generated value for `BNDY_REMOTE_MCP_TOKEN` and rotate it independently of the backend service token.

## Why venue creation does not call Google directly

The production venue Lambda already owns venue identity. Its find-or-create path performs Google Places resolution when necessary, rejects non-building/locality results, checks Place ID/location/name/address matches, and enforces a hard Place ID uniqueness gate. The remote MCP intentionally delegates to that logic rather than duplicating Google matching in another client.

## Artist behaviour

`create_artist` is resolution-aware. The production artist resolver can return an ambiguous `review` result rather than creating. The tool exposes `resolveTo` and `confirmNew` so a reviewed ambiguity can be completed later, while BNDY's hard identity gate remains in force.

## Event behaviour

`create_event` uses the MCP-authenticated community-event route. Production performs external-ID duplicate checks, artist+venue+date duplicate checks, the hard event uniqueness gate and a consistent read-back after creation.

## ChatGPT note

ChatGPT custom full-MCP write apps currently require a supported workspace plan. The remote server itself is standards-compliant and can also be used by other remote-MCP clients. Once the ChatGPT workspace supports full MCP, configure the deployed `/mcp` endpoint and its authentication in the app/connector settings and scan the five tools.
