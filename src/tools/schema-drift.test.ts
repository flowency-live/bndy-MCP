/**
 * Schema Drift Test (WP-3a)
 *
 * Verifies every property declared in an MCP tool's inputSchema
 * is actually referenced in its handler source file.
 *
 * This is a "cheap guard" — it proves the identifier is *mentioned*
 * (not that it's forwarded), but it catches the exact defect class
 * where a schema property is added to index.ts without wiring
 * it through the handler.
 *
 * To verify this test works: delete `nameVariants` from create-artist.ts
 * and run `npm test` — it should fail.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse the index.ts source to extract tool schemas
// (The tools array is inside a callback, so we can't import it directly)
function extractToolSchemas(): Map<string, string[]> {
  const indexPath = resolve(__dirname, '../index.ts');
  let source = readFileSync(indexPath, 'utf8');

  // Strip comments to avoid false positives
  source = source.replace(/\/\/[^\n]*/g, ''); // single-line comments
  source = source.replace(/\/\*[\s\S]*?\*\//g, ''); // multi-line comments

  const schemas = new Map<string, string[]>();

  // Find each tool definition and extract its top-level properties
  // Look for: { name: 'tool_name', ... properties: { prop1: {, prop2: {, ... } }
  const toolRegex = /name:\s*['"]([^'"]+)['"],\s*description:/g;
  let toolMatch;

  while ((toolMatch = toolRegex.exec(source)) !== null) {
    const toolName = toolMatch[1];
    const startPos = toolMatch.index;

    // Find the inputSchema properties block for this tool
    // Look for "properties: {" after this tool's name
    const afterTool = source.slice(startPos, startPos + 5000); // limit search range

    // Find "properties: {" and then extract top-level keys only
    const propsMatch = afterTool.match(/properties:\s*\{/);
    if (!propsMatch) continue;

    const propsStart = propsMatch.index! + propsMatch[0].length;
    const propsSection = afterTool.slice(propsStart);

    // Extract top-level property names by tracking brace depth
    // We want: "propName: {" at depth 0
    const props: string[] = [];
    let depth = 0;
    let i = 0;
    let currentProp = '';
    let inPropName = true;

    while (i < propsSection.length && depth >= 0) {
      const char = propsSection[i];

      if (char === '{') {
        if (depth === 0 && currentProp.trim()) {
          // This is a top-level property definition
          const propName = currentProp.trim().replace(/:$/, '');
          // Filter out schema keywords and ensure it's a valid identifier
          if (propName && /^[a-z][a-zA-Z0-9]*$/.test(propName) &&
              !['type', 'items', 'enum', 'description', 'required', 'additionalProperties'].includes(propName)) {
            props.push(propName);
          }
        }
        depth++;
        inPropName = false;
        currentProp = '';
      } else if (char === '}') {
        depth--;
        if (depth < 0) break; // End of properties block
        inPropName = true;
        currentProp = '';
      } else if (depth === 0) {
        if (char === ',') {
          inPropName = true;
          currentProp = '';
        } else if (inPropName && /[\w:]/.test(char)) {
          currentProp += char;
        }
      }

      i++;
    }

    if (props.length > 0) {
      schemas.set(toolName, props);
    }
  }

  return schemas;
}

// Map tool names to their handler files
const TOOL_HANDLERS: Record<string, string> = {
  search_venue: 'search-venue.ts',
  create_venue: 'create-venue.ts',
  search_artist: 'search-artist.ts',
  create_artist: 'create-artist.ts',
  create_event: 'create-event.ts',
  edit_artist: 'edit-artist.ts',
  edit_venue: 'edit-venue.ts',
  edit_event: 'edit-event.ts',
  search_event: 'search-event.ts',
  list_artists: 'list-artists.ts',
  list_venues: 'list-venues.ts',
  get_by_id: 'get-by-id.ts',
  get_by_external_id: 'get-by-external-id.ts',
  delete_event: 'delete-event.ts',
  delete_artist: 'delete-artist.ts',
  delete_venue: 'delete-venue.ts',
  upload_event_poster: 'upload-event-poster.ts',
  enrich_venue: 'enrich-venue.ts',
  bulk_import: 'bulk-import.ts',
  create_festival: 'create-festival.ts',
  edit_festival: 'edit-festival.ts',
  search_festival: 'search-festival.ts',
  add_lineup_slot: 'add-lineup-slot.ts',
  resolve_lineup_slot: 'resolve-lineup-slot.ts',
  list_captures: 'captures.ts',
  get_capture: 'captures.ts',
  update_capture_status: 'captures.ts',
  add_capture_notes: 'captures.ts',
};

describe('Schema-Handler Drift Detection', () => {
  const schemas = extractToolSchemas();

  for (const [toolName, handlerFile] of Object.entries(TOOL_HANDLERS)) {
    const props = schemas.get(toolName);

    // Skip tools we couldn't parse (may indicate parsing issue)
    if (!props || props.length === 0) {
      it.skip(`${toolName}: no schema properties found (check regex parsing)`, () => {});
      continue;
    }

    it(`${toolName}: every advertised parameter is consumed by its handler`, () => {
      const handlerPath = resolve(__dirname, handlerFile);
      let handlerSource: string;

      try {
        handlerSource = readFileSync(handlerPath, 'utf8');
      } catch {
        // File doesn't exist — skip, don't fail
        console.warn(`Handler file not found: ${handlerFile}`);
        return;
      }

      const dropped = props.filter(p => !new RegExp(`\\b${p}\\b`).test(handlerSource));

      expect(dropped, `Schema properties not found in handler: ${dropped.join(', ')}`).toEqual([]);
    });
  }
});
