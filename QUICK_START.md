# Quick Start - Get MCP Server Running in 30 Minutes

## Pre-flight Check

- [x] Code compiled successfully (`npm run build` completed)
- [ ] Google Places API key obtained
- [ ] Claude Desktop configured
- [ ] MCP server connected
- [ ] First test successful

---

## Step-by-Step Setup

### 1. Get Google API Key (15 minutes)

**Go to**: https://console.cloud.google.com/

**Do this:**
1. Click "Select a project" → "New Project" → Name it "BNDY Events"
2. Wait 30 seconds for project creation
3. Click "APIs & Services" in left menu
4. Click "Enable APIs and Services" (blue button at top)
5. Search for: **"Places API (New)"**
6. Click it → Click "Enable"
7. Wait 30 seconds
8. Click "Credentials" in left menu
9. Click "Create Credentials" → "API Key"
10. **COPY THE KEY** (starts with `AIza...`)
11. Click "Edit API key" (pencil icon)
12. Under "API restrictions":
    - Select "Restrict key"
    - Check ONLY "Places API (New)"
    - Click "Save"

**Save your key somewhere safe.**

---

### 2. Configure Claude Desktop (5 minutes)

**Find the config file:**

Windows:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Full path:
```
C:\Users\[YourUsername]\AppData\Roaming\Claude\claude_desktop_config.json
```

**Open in Notepad** (or VS Code)

**If file is empty or doesn't exist**, paste this:
```json
{
  "mcpServers": {
    "bndy-events": {
      "command": "node",
      "args": [
        "C:\\VSProjects\\bndy-MCPServer\\build\\index.js"
      ],
      "env": {
        "GOOGLE_PLACES_API_KEY": "PASTE_YOUR_KEY_HERE"
      }
    }
  }
}
```

**If file has existing content**, add the `bndy-events` section inside `mcpServers`:
```json
{
  "mcpServers": {
    "existing-server": { ... },
    "bndy-events": {
      "command": "node",
      "args": [
        "C:\\VSProjects\\bndy-MCPServer\\build\\index.js"
      ],
      "env": {
        "GOOGLE_PLACES_API_KEY": "PASTE_YOUR_KEY_HERE"
      }
    }
  }
}
```

**Replace `PASTE_YOUR_KEY_HERE` with your actual Google API key.**

**Save the file.**

---

### 3. Restart Claude Desktop (1 minute)

1. **Quit Claude Desktop completely**:
   - Right-click Claude icon in system tray
   - Click "Quit" (or use Alt+F4)
   - Make sure it's fully closed (check Task Manager if unsure)

2. **Start Claude Desktop again**

3. **Look for connection indicator**:
   - Open a new chat
   - Look for a small icon/indicator showing MCP tools available
   - (Usually a hammer icon or "Tools" badge)

---

### 4. Test the Connection (5 minutes)

Open Claude Desktop and type:

```
Search for the venue "Swiftys" in "Stoke-on-Trent"
```

**Expected response:**
```
I found 1 venue matching "Swiftys" in Stoke-on-Trent:
- Name: Swiftys
- Address: [...full address...]
- Confidence: 100%
```

If you see this, **IT'S WORKING!** 🎉

**If you get an error**, see "Troubleshooting" below.

---

### 5. Create Your First Event (5 minutes)

Type this in Claude:

```
I want to create a test event.

Artist: Double Lively (search first to see if they exist)
Venue: Swiftys, Stoke-on-Trent
Date: 2025-12-01
Time: 21:00
Make it public so it shows on Frontstage
```

**Claude will:**
1. Search for "Double Lively" → Find existing artist
2. Search for "Swiftys" → Find existing venue
3. Create the event
4. Confirm creation with event ID

**Verify:**
1. Go to https://frontstage.bndy.co.uk/events
2. Look for event on Dec 1, 2025
3. Should show "Double Lively @ Swiftys"

---

## Troubleshooting

### Error: "MCP server not connected"

**Fix 1: Check config file syntax**
- Open `claude_desktop_config.json`
- Paste contents into https://jsonlint.com/
- Fix any errors (usually missing commas or quotes)

**Fix 2: Check file path**
- Make sure path uses `\\` (double backslashes)
- Correct: `C:\\VSProjects\\bndy-MCPServer\\build\\index.js`
- Wrong: `C:\VSProjects\bndy-MCPServer\build\index.js`

**Fix 3: Restart again**
- Fully quit Claude Desktop (check Task Manager)
- Wait 10 seconds
- Start Claude Desktop

### Error: "GOOGLE_PLACES_API_KEY not set"

**Fix:**
1. Open `claude_desktop_config.json`
2. Check the API key is in the `env` section
3. Make sure it's the actual key (starts with `AIza...`), not "PASTE_YOUR_KEY_HERE"
4. Restart Claude Desktop

### Error: "REQUEST_DENIED" from Google Places

**Fix:**
1. Go to Google Cloud Console
2. Check "Places API (New)" is enabled (not "Places API" old version)
3. Check API key restrictions allow "Places API (New)"
4. Wait 2-3 minutes for changes to propagate

### Error: "Venue not found in Google Places"

**This is normal** for very small venues.

**Workaround:**
1. Go to Google Maps
2. Search for the venue manually
3. If it exists, copy the exact name from Google Maps
4. Try again with exact name

**If venue really doesn't exist in Google Maps:**
- You'll need to create it manually in Backstage first
- Or skip that event for now

### Error: "Failed to create event"

**Check:**
1. Artist ID exists (search first)
2. Venue ID exists (search first)
3. Date format is YYYY-MM-DD
4. Time format is HH:MM (24-hour)

**Debug:**
Ask Claude: "What was the error message from the API?"

---

## You're Live!

Once the test event worked, you can start bulk importing.

**Recommended workflow:**

1. **Find gig lists** (Facebook, band websites, venue schedules)
2. **Screenshot or copy text**
3. **Paste into Claude Desktop**
4. **Say**: "Please create all these events in BNDY. Default time is 9pm. City is Stoke-on-Trent unless stated otherwise."
5. **Review Claude's plan**
6. **Approve**
7. **Claude creates all events**
8. **Verify in Frontstage**

**Tips:**
- Start with 5-10 events at a time (test quality)
- Check Frontstage after each batch
- Note which venues Claude struggles with
- Manually create problematic venues in Backstage first

---

## Next: Bulk Import Session

When you're ready to populate hundreds of events:

1. **Prepare sources**:
   - Facebook Events screenshots
   - Band tour schedules (copy/paste)
   - Venue "What's On" pages
   - Local gig guides

2. **Set aside 2-3 hours**

3. **Work in batches**:
   - 10 events per conversation
   - Verify each batch in Frontstage
   - Start new chat for next batch

4. **Track progress**:
   - Keep a list of processed sources
   - Note successful venues vs problematic ones
   - Record any patterns in errors

**Expected throughput**: 20-30 events per hour (including verification)

---

## Support

**Full documentation**: [SETUP.md](./SETUP.md)

**Implementation details**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

**If stuck**: Check Claude Desktop logs (Settings > Developer > Show Logs)
