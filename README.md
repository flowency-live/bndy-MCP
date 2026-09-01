# BNDY MCP Server

Model Context Protocol server for AI-driven event creation in BNDY platform.

## Overview

This MCP server allows Claude Desktop (or other MCP clients) to interact with BNDY's AWS Lambda infrastructure to:
- Search for venues and artists
- Create new venues and artists (with AI review flags)
- Create events linking artists and venues

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with credentials
- Claude Desktop app installed
- Access to BNDY AWS infrastructure (eu-west-2)

## Installation

```bash
npm install
npm run build
```

## Configuration

### Claude Desktop Setup

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bndy-events": {
      "command": "node",
      "args": [
        "C:\\VSProjects\\bndy-MCPServer\\dist\\index.js"
      ],
      "env": {
        "AWS_REGION": "eu-west-2",
        "AWS_PROFILE": "default"
      }
    }
  }
}
```

## Tools Available

### 1. search_venue
Search for existing venues by name and city.

**Input**:
```typescript
{
  name: string;    // e.g., "Murphys"
  city: string;    // e.g., "Bury"
}
```

### 2. create_venue
Create a new venue with AI review flags.

**Input**:
```typescript
{
  name: string;
  address: string;
  city: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
}
```

### 3. search_artist
Search for existing artists by name.

**Input**:
```typescript
{
  name: string;
  region?: string;
}
```

### 4. create_artist
Create a new artist with AI review flags.

**Input**:
```typescript
{
  name: string;
  artistType: 'band' | 'solo' | 'duo' | 'dj' | 'other';
  genres?: string[];
  facebookUrl?: string;
  instagramUrl?: string;
  spotifyUrl?: string;
}
```

### 5. create_event
Create an event linking artist and venue.

**Input**:
```typescript
{
  artistId: string;
  venueId: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM (24-hour)
  endTime?: string;
  title?: string;
  isPublic?: boolean;
}
```

### Read-only discovery: `discover_events`

Grounded public discovery for Ask bndy and other MCP clients. It queries the canonical BNDY public events API and supports:

- bounded date windows;
- Artist, Venue, title and city text;
- town or city;
- ticketed or recorded non-ticketed events;
- open-mic filtering;
- distance from supplied coordinates;
- bounded, sorted results with canonical BNDY event URLs.

The tool is deliberately read-only. It returns `grounded: true` and `source: "canonical-bndy"`, excludes cancelled events and never generates a gig that is absent from the canonical API. Voice transcription and conversational intent extraction belong to the consuming Ask bndy experience, not this data tool.

## Example Usage

In Claude Desktop:

```
User: "Create events for Millhouse's December tour:
- Dec 15 @ The Cavern Club, Liverpool - 8pm
- Dec 16 @ O2 Academy, Birmingham - 7:30pm"

Claude: [Uses MCP tools to search venues, create events, returns confirmation]
```

## Development

```bash
# Build TypeScript
npm run build

# Watch mode
npm run dev

# Run server
npm start
```

## AWS Lambda Functions Used

- **VenuesFunction**: `bndy-serverless-api-VenuesFunction-z91LnIIRKHhq`
- **ArtistsFunction**: `bndy-serverless-api-ArtistsFunction-4wCJA9JLMwF5`
- **EventsFunction**: `bndy-serverless-api-EventsFunction-03skAPFIwe9g`

## Security

- Uses your local AWS credentials
- No public endpoints
- Local-only stdio communication
- All AI-created entities flagged for review

## Related Documentation

- [AI MCP Event Creation Guide](../bndy All Platform Docs/Feature Development/AI_MCP_EVENT_CREATION.md)
- [BNDY Platform Bible](../bndy All Platform Docs/BNDY_PLATFORM_BIBLE.md)
