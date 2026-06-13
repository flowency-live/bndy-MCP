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
 * Deduplicates by source+id combination.
 *
 * @param existing - Current external IDs on the entity
 * @param incoming - New external IDs to add
 * @returns Merged array with no duplicates
 */
export function mergeExternalIds(
  existing: ExternalId[],
  incoming: ExternalId[]
): ExternalId[] {
  const merged = [...existing];

  for (const newId of incoming) {
    const isDuplicate = merged.some(
      e => e.source === newId.source && e.id === newId.id
    );
    if (!isDuplicate) {
      merged.push(newId);
    }
  }

  return merged;
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
