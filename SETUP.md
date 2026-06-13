# BNDY MCP Server - Setup Guide

## What This Does

This MCP (Model Context Protocol) server enables Claude Desktop to create BNDY events from gig lists (images, text, HTML).

**Workflow:**
1. Paste a gig list into Claude Desktop (image or text)
2. Claude extracts event details using AI
3. For each event:
   - Searches Google Places for venue (gets coordinates + place ID)
   - Calls `/api/venues/find-or-create` (matches existing or creates new)
   - Searches `/api/artists` (uses existing or creates new)
   - Creates event via `/api/events/community`
4. Reports success with venue/artist status

---

## Prerequisites

1. **Node.js 18+** (already installed)
2. **Claude Desktop** installed
3. **Google Places API Key** (get one below)

---

## Step 1: Get Google Places API Key

### Create API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Places API (New)**:
   - Go to "APIs & Services" > "Library"
   - Search for "Places API (New)"
   - Click "Enable"
4. Create API Key:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the key (format: `AIza...`)
5. **IMPORTANT**: Restrict the key:
   - Click "Edit API key"
   - Under "API restrictions" > Select "Restrict key"
   - Check ONLY "Places API (New)"
   - Save

### Pricing

- **First $200/month**: FREE (Google Cloud free tier)
- **Places Text Search**: $17 per 1,000 requests
- **Your usage**: ~10-50 requests/session = $0.17-0.85 per session
- **Realistic monthly cost**: $0 (within free tier)

---

## Step 2: Configure Environment Variables

Create `.env` file in `C:\VSProjects\bndy-MCPServer`:

```bash
GOOGLE_PLACES_API_KEY=AIza...your-key-here
```

**DO NOT commit this file to Git** (already in `.gitignore`)

---

## Step 3: Build the MCP Server

```bash
cd C:\VSProjects\bndy-MCPServer
npm install
npm run build
```

---

## Step 4: Configure Claude Desktop

### Find Claude Desktop Config

Windows location:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Full path:
```
C:\Users\[YourUsername]\AppData\Roaming\Claude\claude_desktop_config.json
```

### Add MCP Server

Open the config file and add this to the `mcpServers` section:

```json
{
  "mcpServers": {
    "bndy-events": {
      "command": "node",
      "args": [
        "C:\\VSProjects\\bndy-MCPServer\\build\\index.js"
      ],
      "env": {
        "GOOGLE_PLACES_API_KEY": "AIza...your-key-here"
      }
    }
  }
}
```

**Replace** `AIza...your-key-here` with your actual API key.

**Important**: Use double backslashes `\\` in Windows paths.

---

## Step 5: Restart Claude Desktop

1. Completely quit Claude Desktop (check system tray)
2. Start Claude Desktop
3. Look for MCP server connection indicator in Claude

---

## Step 6: Test the Tools

In Claude Desktop, try:

```
Search for the artist "Double Lively"
```

Claude should use the `search_artist` tool and return results from BNDY.

Try:

```
Search for venue "Swiftys" in "Stoke-on-Trent"
```

Claude should use the `search_venue` tool.

---

## Available Tools

Claude has access to these 5 tools:

### 1. `search_venue`
- **Purpose**: Find existing venues in BNDY
- **Parameters**: `name` (string), `city` (string)
- **Returns**: List of matching venues with confidence scores

### 2. `create_venue`
- **Purpose**: Create new venue (or find existing)
- **Parameters**: `name`, `address`, `city`
- **Process**:
  1. Searches Google Places
  2. Calls `/api/venues/find-or-create`
  3. Returns venue ID + match status
- **Flags**: `ai_created: true`, `needs_review: true`, `source: 'mcp_ai_import'`

### 3. `search_artist`
- **Purpose**: Find existing artists in BNDY
- **Parameters**: `name` (string), `region` (optional string)
- **Returns**: List of matching artists with confidence scores

### 4. `create_artist`
- **Purpose**: Create new artist
- **Parameters**: `name`, `artistType` (band/solo/duo/dj/other), `genres` (optional)
- **Process**: Calls `/api/artists/community`
- **Flags**: `ai_created: true`, `source: 'mcp_ai_import'`

### 5. `create_event`
- **Purpose**: Create event linking artist + venue
- **Parameters**: `artistId`, `venueId`, `date` (YYYY-MM-DD), `startTime` (HH:MM), `isPublic` (boolean)
- **Process**: Calls `/api/events/community`
- **Flags**: `source: 'mcp_ai_import'`

---

## Example Usage

### Paste a gig list:

```
Here's Double Lively's gig schedule:
- Fri Nov 28 - The Robert Peel, Stoke-on-Trent
- Sat Nov 29 - Bar 41, Stoke-on-Trent
- Fri Dec 5 - Hog Noggins, Stoke-on-Trent

Please create these events in BNDY. Start time is 9pm for all.
```

### Claude will:

1. Extract 3 events
2. Search for "Double Lively" → Find existing artist
3. For each venue:
   - Search BNDY first
   - If not found, search Google Places → Create venue
4. Create 3 events
5. Report summary:
   - "Created 3 events"
   - "Artist: Double Lively (existing)"
   - "Venues: 1 existing (Hog Noggins), 2 new (The Robert Peel, Bar 41)"

---

## Troubleshooting

### MCP Server Not Connecting

1. Check Claude Desktop config syntax (valid JSON)
2. Check file path uses double backslashes `\\`
3. Restart Claude Desktop completely
4. Check logs in Claude Desktop (Settings > Developer)

### Google Places API Errors

**Error**: `GOOGLE_PLACES_API_KEY not set`
- **Fix**: Add API key to `.env` file AND Claude Desktop config

**Error**: `API key not valid`
- **Fix**: Check key is correct, enable Places API (New) in Google Cloud Console

**Error**: `REQUEST_DENIED`
- **Fix**: Enable "Places API (New)" in Google Cloud Console

### Venue Not Found in Google Places

- Try more specific search: `"Sir Robert Peel, 58 Peel St, Stoke-on-Trent"`
- Check spelling
- Some small venues may not be in Google Maps

### Events Not Appearing in Frontstage

- Check `isPublic: true` was set
- Check event date is in future
- Check artist has `validated: true`
- Check venue has coordinates (lat/lng not 0)

---

## Reusability for N8N (Phase 2)

When building public web form + N8N workflow, reuse:

### 1. Google Places Logic
- File: `src/utils/google-places.ts`
- Function: `findPlace(query)`
- **N8N Node**: "Google Places" (built-in)
- **Equivalent**: Text Search with same fields

### 2. Venue Creation
- File: `src/tools/create-venue.ts`
- API: `POST /api/venues/find-or-create`
- **N8N Node**: "HTTP Request"
- **Body**:
  ```json
  {
    "name": "{{$json.placeName}}",
    "address": "{{$json.placeAddress}}",
    "googlePlaceId": "{{$json.placeId}}",
    "latitude": "{{$json.lat}}",
    "longitude": "{{$json.lng}}",
    "ai_created": true,
    "needs_review": true,
    "created_source": "web_submission"
  }
  ```

### 3. Artist Creation
- File: `src/tools/create-artist.ts`
- API: `POST /api/artists/community`
- **N8N Node**: "HTTP Request"

### 4. Event Creation
- File: `src/tools/create-event.ts`
- API: `POST /api/events/community`
- **N8N Node**: "HTTP Request"

### 5. AI Extraction (NEW for N8N)
- **N8N Node**: "OpenAI" (GPT-4 Vision)
- **Prompt**: "Extract all events from this image. Return JSON array with: artistName, venueName, date, time, city"
- **Input**: User uploaded image/text

---

## Architecture Diagram

```
[Claude Desktop Chat]
        ↓
   [MCP Server] (this repo)
        ↓
   [Google Places API] ----→ Get venue coordinates + place ID
        ↓
   [BNDY Public APIs]
        ├── /api/venues/find-or-create
        ├── /api/artists/community
        └── /api/events/community
        ↓
   [DynamoDB Tables]
        ├── bndy-venues
        ├── bndy-artists
        └── bndy-events
```

**Future (Phase 2):**
```
[Public Web Form] (Frontstage)
        ↓
   [N8N Webhook]
        ↓
   [N8N Workflow]
        ├── OpenAI Vision (extract events)
        ├── Google Places (venue lookup)
        └── BNDY APIs (create artists/venues/events)
        ↓
   [DynamoDB] → Same as above
```

---

## Support

**Issues**: Check [C:\VSProjects\bndy All Platform Docs\README.md](C:\VSProjects\bndy All Platform Docs\README.md)

**MCP Documentation**: https://modelcontextprotocol.io/

**Google Places API Docs**: https://developers.google.com/maps/documentation/places/web-service/text-search
