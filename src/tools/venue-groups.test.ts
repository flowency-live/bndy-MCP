/**
 * Feature 19 — MCP venue ownership group tools.
 *
 * Tools under test:
 *   list_venue_groups  - GET /api/venue-groups
 *   create_venue_group - POST /api/venue-groups (idempotent via 409)
 *
 * edit_venue with ownerGroupId/tenure is tested in edit-venue.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the http-client module
vi.mock('../utils/http-client.js', () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: any;
    constructor(status: number, body: any) {
      super(`HTTP ${status}`);
      this.name = 'ApiError';
      this.status = status;
      this.body = typeof body === 'string' ? JSON.parse(body) : body;
    }
    get isDuplicate(): boolean {
      return this.status === 409 || this.body?.code === 'DUPLICATE_GROUP';
    }
  },
}));

import { listVenueGroups, createVenueGroup } from './venue-groups.js';
import { apiRequest, ApiError } from '../utils/http-client.js';

const mockApiRequest = apiRequest as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list_venue_groups', () => {
  it('returns groups from the API', async () => {
    mockApiRequest.mockResolvedValue({
      groups: [
        { id: 'g1', slug: 'robinsons-brewery', name: 'Robinsons Brewery', groupType: 'brewery', venueCount: 235 },
        { id: 'g2', slug: 'amber-taverns', name: 'Amber Taverns', groupType: 'pubco', venueCount: 50 },
      ],
    });

    const result = JSON.parse(await listVenueGroups());

    expect(result.success).toBe(true);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].name).toBe('Robinsons Brewery');
    expect(mockApiRequest).toHaveBeenCalledWith('/api/venue-groups', 'GET');
  });

  it('returns an empty array when no groups exist', async () => {
    mockApiRequest.mockResolvedValue({ groups: [] });

    const result = JSON.parse(await listVenueGroups());

    expect(result.success).toBe(true);
    expect(result.groups).toEqual([]);
    expect(result.message).toContain('0 venue groups');
  });
});

describe('create_venue_group', () => {
  it('creates a new group', async () => {
    mockApiRequest.mockResolvedValue({
      group: { id: 'g1', slug: 'robinsons-brewery', name: 'Robinsons Brewery', groupType: 'brewery' },
    });

    const result = JSON.parse(await createVenueGroup({
      name: 'Robinsons Brewery',
      groupType: 'brewery',
    }));

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.group.name).toBe('Robinsons Brewery');
    expect(mockApiRequest).toHaveBeenCalledWith('/api/venue-groups', 'POST', {
      name: 'Robinsons Brewery',
      groupType: 'brewery',
    });
  });

  it('returns existing group on 409 duplicate', async () => {
    const error = new (ApiError as any)(409, JSON.stringify({
      error: 'A group with that name already exists',
      code: 'DUPLICATE_GROUP',
      existingId: 'g1',
    }));
    mockApiRequest.mockRejectedValue(error);

    const result = JSON.parse(await createVenueGroup({
      name: 'Robinsons Brewery',
      groupType: 'brewery',
    }));

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.groupId).toBe('g1');
    expect(result.message).toContain('already exists');
  });

  it('includes optional fields when provided', async () => {
    mockApiRequest.mockResolvedValue({
      group: { id: 'g1', slug: 'robinsons-brewery', name: 'Robinsons Brewery', groupType: 'brewery', website: 'https://robinsons.co.uk' },
    });

    await createVenueGroup({
      name: 'Robinsons Brewery',
      groupType: 'brewery',
      website: 'https://robinsons.co.uk',
      bio: 'Family brewery since 1838',
    });

    expect(mockApiRequest).toHaveBeenCalledWith('/api/venue-groups', 'POST', {
      name: 'Robinsons Brewery',
      groupType: 'brewery',
      website: 'https://robinsons.co.uk',
      bio: 'Family brewery since 1838',
    });
  });

  it('requires name', async () => {
    const result = JSON.parse(await createVenueGroup({
      groupType: 'brewery',
    } as any));

    expect(result.success).toBe(false);
    expect(result.error).toContain('name is required');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('requires groupType', async () => {
    const result = JSON.parse(await createVenueGroup({
      name: 'Robinsons Brewery',
    } as any));

    expect(result.success).toBe(false);
    expect(result.error).toContain('groupType is required');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('validates groupType enum', async () => {
    const result = JSON.parse(await createVenueGroup({
      name: 'Robinsons Brewery',
      groupType: 'brewary' as any, // typo
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('groupType must be one of');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
