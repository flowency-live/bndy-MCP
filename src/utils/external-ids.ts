// External ID utilities for merge operations

export interface ExternalId {
  source: string;
  id: string;
}

/**
 * Normalizes an external ID by stripping doubled source prefix.
 * Example: { source: "klma", id: "klma:venue-123" } → { source: "klma", id: "venue-123" }
 *
 * This handles the case where callers accidentally pass pre-prefixed IDs,
 * preventing doubled-up lookups like "klma:klma:venue-123".
 *
 * @param externalId - The external ID to normalize
 * @returns Normalized external ID with any doubled prefix stripped
 */
export function normalizeExternalId(externalId: ExternalId): ExternalId {
  const { source, id } = externalId;
  const prefix = `${source}:`;

  if (id.startsWith(prefix)) {
    console.warn(`[externalId] Stripped doubled prefix from ${source}:${id} → ${source}:${id.slice(prefix.length)}`);
    return { source, id: id.slice(prefix.length) };
  }

  return externalId;
}

/**
 * Normalizes an array of external IDs, stripping any doubled prefixes.
 *
 * @param externalIds - Array of external IDs to normalize
 * @returns Normalized array with doubled prefixes stripped
 */
export function normalizeExternalIds(externalIds: ExternalId[]): ExternalId[] {
  if (!externalIds || externalIds.length === 0) return externalIds;
  return externalIds.map(normalizeExternalId);
}

/**
 * Merges incoming external IDs with existing ones.
 *
 * FIX 2026-08-19: Keys on (source, id) tuple, NOT source alone.
 * A venue can have multiple IDs from the same source (e.g., klma:venue-123 AND
 * klma-stoke-gig-list:venue-456). The old implementation keyed on source only,
 * so adding a second klma ID replaced the first. This broke live data.
 *
 * Deduplication: exact (source, id) pairs are deduplicated; different IDs from
 * the same source coexist.
 *
 * @param existing - Current external IDs on the entity
 * @param incoming - New external IDs to add
 * @returns Merged array with unique (source, id) pairs
 */
export function mergeExternalIds(
  existing: ExternalId[],
  incoming: ExternalId[]
): ExternalId[] {
  // Key on (source, id) tuple to allow multiple IDs from same source
  const byKey = new Map<string, ExternalId>();

  // Add existing entries
  for (const ext of existing) {
    const key = `${ext.source}:${ext.id}`;
    byKey.set(key, ext);
  }

  // Add incoming - only dedups exact (source, id) matches
  for (const newId of incoming) {
    const key = `${newId.source}:${newId.id}`;
    if (!byKey.has(key)) {
      console.error(`[externalId] Adding ${key}`);
    }
    byKey.set(key, newId);
  }

  return Array.from(byKey.values());
}

/**
 * Validates an external ID array.
 * @param ids - Array to validate
 * @returns true if valid, throws if invalid
 */
export function validateExternalIds(ids: unknown): ids is ExternalId[] {
  if (!Array.isArray(ids)) {
    throw new Error('externalIds must be an array');
  }

  for (const id of ids) {
    if (typeof id !== 'object' || id === null) {
      throw new Error('Each externalId must be an object');
    }
    if (typeof (id as any).source !== 'string' || (id as any).source.trim() === '') {
      throw new Error('Each externalId must have a non-empty source string');
    }
    if (typeof (id as any).id !== 'string' || (id as any).id.trim() === '') {
      throw new Error('Each externalId must have a non-empty id string');
    }
  }

  return true;
}
