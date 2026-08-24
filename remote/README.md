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

The one-time bootstrap stack creates `bndy/remote-mcp` in AWS Secrets Manager and generates a 64-character client token automatically. The existing backend token remains in `bndy/mcp-service`. Neither secret is committed to GitHub or written to CI logs.

GitHub does not store a long-lived AWS access key for this service. Deployments use GitHub Actions OIDC to assume `bndy-remote-mcp-github-deploy`, whose trust policy is restricted to `flowency-live/bndy-MCP` on `refs/heads/main`.

The Lambda uses the fixed `bndy-remote-mcp-execution-role`, which has only the AWS managed basic Lambda logging policy. It has no DynamoDB, BNDY Lambda or Secrets Manager runtime permissions. CloudFormation resolves the two secret values into the Lambda configuration at deployment time.

The Function URL uses `AuthType: NONE` because an MCP client is not expected to sign AWS IAM requests. Application-level bearer authentication is mandatory for `/mcp`. `/health` contains no sensitive data.

## AWS resources

### One-time bootstrap: `bootstrap.yaml`

Creates and retains:

- Secrets Manager secret `bndy/remote-mcp`
- Lambda execution role `bndy-remote-mcp-execution-role`
- GitHub OIDC deploy role `bndy-remote-mcp-github-deploy`

### Application stack: `template.yaml`

Creates:

- Lambda `bndy-remote-mcp`
- streaming Lambda Function URL (`RESPONSE_STREAM`)

Region: `eu-west-2`.

## Build and validation

```bash
cd remote
npm install
npm run check
npm test
npm run build
sam validate --lint -t template.yaml --region eu-west-2
sam validate --lint -t bootstrap.yaml --region eu-west-2
sam build -t template.yaml
```

The integration test uses the real MCP v2 client library. It proves bearer rejection, protocol negotiation, discovery of exactly the five intended tools and a complete `search_venue` call delegated to a mocked BNDY API with the separate backend service credential.

## One-time AWS bootstrap

This is the only AWS operator step required before GitHub can deploy the service.

From AWS CloudShell in account `771551874768`:

```bash
curl -fsSL https://raw.githubusercontent.com/flowency-live/bndy-MCP/main/remote/bootstrap.yaml \
  -o /tmp/bndy-remote-mcp-bootstrap.yaml

aws cloudformation deploy \
  --template-file /tmp/bndy-remote-mcp-bootstrap.yaml \
  --stack-name bndy-remote-mcp-bootstrap \
  --region eu-west-2 \
  --capabilities CAPABILITY_NAMED_IAM
```

The bootstrap assumes the account-level GitHub Actions OIDC provider for `token.actions.githubusercontent.com` already exists. Other Flowency workloads in this AWS account already use that provider.

Do not retrieve or paste either secret during bootstrap.

## Deployment

After the bootstrap succeeds, either push a remote-MCP change to `main` or run **Remote MCP CI/CD** manually from GitHub Actions.

The workflow:

1. typechecks the service
2. runs the real MCP client integration tests
3. validates both CloudFormation/SAM templates
4. assumes the BNDY MCP deployment role through GitHub OIDC
5. builds and deploys stack `bndy-remote-mcp`
6. verifies `GET /health`
7. verifies unauthenticated `POST /mcp` returns `401`
8. writes a sanitised deployment receipt to branch `remote-mcp-deploy-status`

The receipt contains the safe Function URL and status only. It never contains either bearer token.

## Connecting ChatGPT

On ChatGPT Business web, create a custom MCP app in Developer Mode using:

- Endpoint: `<RemoteMcpFunctionUrl>mcp`
- Authentication: bearer token
- Token: the `token` value stored in AWS Secrets Manager secret `bndy/remote-mcp`

Retrieve/view that value only in an authenticated AWS operator session. Do not paste it into chat, source control, issues or logs.

Keep the app as a draft until search and controlled create tests pass.

## Why venue creation does not call Google directly

The production venue Lambda already owns venue identity. Its find-or-create path performs Google Places resolution when necessary, rejects non-building/locality results, checks Place ID/location/name/address matches and enforces a hard Place ID uniqueness gate. The remote MCP delegates to that logic rather than duplicating it.

## Artist behaviour

`create_artist` is resolution-aware. The production artist resolver can return an ambiguous `review` result rather than creating. The tool exposes `resolveTo` and `confirmNew` so reviewed ambiguity can be completed while the hard identity gate remains authoritative.

## Event behaviour

`create_event` uses the MCP-authenticated community-event route. Production performs external-ID duplicate checks, artist+venue+date duplicate checks, the hard event uniqueness gate and a consistent read-back after creation.
