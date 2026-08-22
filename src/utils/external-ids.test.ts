// External ID utilities tests - Blocker #3 fix verification

import { mergeExternalIds, normalizeExternalId, ExternalId } from './external-ids.js';

describe('mergeExternalIds (Blocker #3 fix)', () => {
  it('should add new source when not present', () => {
    const existing: ExternalId[] = [
      { source: 'source-a', id: 'id-a' }
    ];
    const incoming: ExternalId[] = [
      { source: 'source-b', id: 'id-b' }
    ];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ source: 'source-a', id: 'id-a' });
    expect(result).toContainEqual({ source: 'source-b', id: 'id-b' });
  });

  it('should NOT duplicate when same source+id is added', () => {
    const existing: ExternalId[] = [
      { source: 'fantasticallibrary', id: '2026-08-06-courtney-may-music' }
    ];
    const incoming: ExternalId[] = [
      { source: 'fantasticallibrary', id: '2026-08-06-courtney-may-music' }
    ];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ source: 'fantasticallibrary', id: '2026-08-06-courtney-may-music' });
  });

  it('should APPEND when same source with different id is added (fix 2026-08-19)', () => {
    // FIX 2026-08-19: Two IDs from the same source should BOTH survive.
    // The old implementation keyed on source only, so adding a second klma ID
    // replaced the first. This broke live data (e.g., klma:venue-123 was lost
    // when klma-stoke-gig-list:venue-456 was added).
    const existing: ExternalId[] = [
      { source: 'klma', id: 'venue-123' }
    ];
    const incoming: ExternalId[] = [
      { source: 'klma', id: 'venue-456' }
    ];

    const result = mergeExternalIds(existing, incoming);

    // Should have TWO entries - both IDs from the same source survive
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ source: 'klma', id: 'venue-123' });
    expect(result).toContainEqual({ source: 'klma', id: 'venue-456' });
  });

  it('should still dedup exact (source, id) pairs', () => {
    // Exact duplicates are still deduplicated
    const existing: ExternalId[] = [
      { source: 'klma', id: 'venue-123' }
    ];
    const incoming: ExternalId[] = [
      { source: 'klma', id: 'venue-123' }
    ];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ source: 'klma', id: 'venue-123' });
  });

  it('should preserve multiple different sources', () => {
    const existing: ExternalId[] = [
      { source: 'onthecasemusic', id: 'event-123' },
      { source: 'insangel', id: 'gig-456' }
    ];
    const incoming: ExternalId[] = [
      { source: 'fantasticallibrary', id: 'listing-789' }
    ];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ source: 'onthecasemusic', id: 'event-123' });
    expect(result).toContainEqual({ source: 'insangel', id: 'gig-456' });
    expect(result).toContainEqual({ source: 'fantasticallibrary', id: 'listing-789' });
  });

  it('should handle empty existing array', () => {
    const existing: ExternalId[] = [];
    const incoming: ExternalId[] = [
      { source: 'source-a', id: 'id-a' }
    ];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ source: 'source-a', id: 'id-a' });
  });

  it('should handle empty incoming array', () => {
    const existing: ExternalId[] = [
      { source: 'source-a', id: 'id-a' }
    ];
    const incoming: ExternalId[] = [];

    const result = mergeExternalIds(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ source: 'source-a', id: 'id-a' });
  });
});

describe('normalizeExternalId', () => {
  it('should strip doubled prefix', () => {
    const input = { source: 'klma', id: 'klma:venue-123' };
    const result = normalizeExternalId(input);
    expect(result).toEqual({ source: 'klma', id: 'venue-123' });
  });

  it('should not modify non-doubled id', () => {
    const input = { source: 'klma', id: 'venue-123' };
    const result = normalizeExternalId(input);
    expect(result).toEqual({ source: 'klma', id: 'venue-123' });
  });
});
