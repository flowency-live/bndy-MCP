# BNDY Remote MCP

Remote, authenticated MCP facade for BNDY record creation, hosted in AWS Lambda.

The service is deliberately thin. It has no DynamoDB or BNDY Lambda permissions. It calls the existing production API at `https://api.bndy.co.uk`, so BNDY's production validation, deduplication, identity and uniqueness gates remain authoritative.

The existing root MCP server remains the local/stdio implementation. This directory is isolated so the remote endpoint can use the current MCP v2 SDK without forcing a migration of the local server.

## Architecture

```text
ChatGPT
  -> HTTPS /mcp (bearer auth)
  -> bndy-remote-mcp Lambda Function URL (response streaming)
  -> https://api.bndy.co.uk
  -> existing BNDY Artists / Venues / Events Lambdas
  -> existing identity + uniqueness gates
```

## Exposed tools

- `search_venue` - read only
- `create_venue` - find-or-create through `/api/venues/find-or-create/mcp`
- `search_artist` - read only
- `create_artist` - resolve/find-or-create through `/api/artists/find-or-create/mcp`
- `create_event` - create through `/api/events/community/mcp`

No edit or delete tools are exposed in the first remote release.

## Security model

There are two separate bearer credentials:

1. `BNDY_REMOTE_MCP_TOKEN` authenticates ChatGPT or another MCP client to the Lambda endpoint.
2. `BNDY_MCP_SERVICE_TOKEN` authenticates the Lambda to BNDY's production API.

They are deliberately different.

The SAM stack creates `bndy/remote-mcp` in AWS Secrets Manager and generates a 64-character client token automatically. The existing backend token is read from `bndy/mcp-service` through a CloudFormation Secrets Manager dynamic reference. Neither secret is committed to GitHub or written to CI logs.

The Lambda execution role is the SAM-generated basic Lambda role only. It does not receive DynamoDB, BNDY Lambda, or application Secrets Manager read permissions at runtime; CloudFormation resolves the secret values into the Lambda configuration during deployment.

The Function URL uses `AuthType: NONE` because ChatGPT cannot sign AWS IAM requests. Application-level bearer authentication is mandatory for `/mcp`. `/health` contains no sensitive data.

## AWS resources

`template.yaml` creates:

- Lambda: `bndy-remote-mcp`
- streaming Lambda Function URL (`RESPONSE_STREAM`)
- Secrets Manager secret: `bndy/remote-mcp`

Region: `eu-west-2` via CI/CD.

## Build and validation

```bash
cd remote
npm install
npm run check
npm run build
sam validate -t template.yaml
sam build -t template.yaml
```

## Deployment

Pushes to `main` deploy through `.github/workflows/remote-mcp-ci.yml` using the same AWS credential secret names as the BNDY serverless API estate:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Stack: `bndy-remote-mcp`

Deployment also smoke-tests:

- `GET /health` returns configured/healthy
- unauthenticated `POST /mcp` returns `401`

The workflow summary prints the safe Function URL endpoint but never the bearer token.

## Connecting ChatGPT

On ChatGPT Business web, create a custom MCP app in Developer Mode using:

- Endpoint: `<RemoteMcpFunctionUrl>mcp`
- Authentication: bearer token
- Token: the `token` value stored in AWS Secrets Manager secret `bndy/remote-mcp`

Retrieve/view that value only in an authenticated AWS operator session. Do not paste it into chat, source control, issues, or logs.

Keep the app as a draft until search and controlled create tests pass. Business custom apps freeze their tool snapshot when published, so finish the initial tool surface before publishing.

## Why venue creation does not call Google directly

The production venue Lambda already owns venue identity. Its find-or-create path performs Google Places resolution when necessary, rejects non-building/locality results, checks Place ID/location/name/address matches, and enforces a hard Place ID uniqueness gate. The remote MCP delegates to that logic rather than duplicating it.

## Artist behaviour

`create_artist` is resolution-aware. The production artist resolver can return an ambiguous `review` result rather than creating. The tool exposes `resolveTo` and `confirmNew` so reviewed ambiguity can be completed while the hard identity gate remains authoritative.

## Event behaviour

`create_event` uses the MCP-authenticated community-event route. Production performs external-ID duplicate checks, artist+venue+date duplicate checks, the hard event uniqueness gate and a consistent read-back after creation.
