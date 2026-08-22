// Search Event Tool Tests
// TDD: Write tests FIRST, then implement

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchEvent, SearchEventParams } from './search-event.js';

// Mock the HTTP client
vi.mock('../utils/http-client.js', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../utils/http-client.js';
const mockApiRequest = vi.mocked(apiRequest);

describe('searchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find events by artistId', async () => {
    const params: SearchEventParams = {
      artistId: 'artist-123',
    };

    mockApiRequest.mockResolvedValueOnce([
      {
        id: 'event-001',
        title: 'Live at The Venue',
        date: '2026-05-15',
        startTime: '20:00',
        artistId: 'artist-123',
        venueId: 'venue-456',
        venueName: 'The Venue',
      },
      {
        id: 'event-002',
        title: 'Summer Festival',
        date: '2026-06-20',
        startTime: '19:00',
        artistId: 'artist-123',
        venueId: 'venue-789',
        venueName: 'Festival Grounds',
      },
    ]);

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(true);
    expect(parsed.count).toBe(2);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0].id).toBe('event-001');
    expect(parsed.events[0].venueId).toBe('venue-456');
    // Now includes default date params (today + 12 months)
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/artists\/artist-123\/public-events\?startDate=.*&endDate=.*/),
      'GET'
    );
  });

  it('should return empty results when no events found', async () => {
    const params: SearchEventParams = {
      artistId: 'artist-no-events',
    };

    mockApiRequest.mockResolvedValueOnce([]);

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(false);
    expect(parsed.message).toContain('No events found');
  });

  it('should filter by date range when provided', async () => {
    const params: SearchEventParams = {
      artistId: 'artist-123',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
    };

    mockApiRequest.mockResolvedValueOnce([
      {
        id: 'event-001',
        title: 'May Gig',
        date: '2026-05-15',
        artistId: 'artist-123',
        venueId: 'venue-456',
      },
    ]);

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(true);
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/artists/artist-123/public-events?startDate=2026-05-01&endDate=2026-05-31',
      'GET'
    );
  });

  it('should search by venueId', async () => {
    const params: SearchEventParams = {
      venueId: 'venue-456',
    };

    mockApiRequest.mockResolvedValueOnce([
      {
        id: 'event-001',
        title: 'Live Music Night',
        date: '2026-05-15',
        artistId: 'artist-123',
        artistName: 'The Band',
        venueId: 'venue-456',
      },
    ]);

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(true);
    expect(parsed.events[0].artistName).toBe('The Band');
    // Now includes default date params (today + 12 months)
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/venues\/venue-456\/events\?startDate=.*&endDate=.*/),
      'GET'
    );
  });

  it('should handle API errors gracefully', async () => {
    const params: SearchEventParams = {
      artistId: 'artist-123',
    };

    mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(false);
    expect(parsed.error).toBe('Network error');
  });

  it('should require at least artistId or venueId', async () => {
    const params: SearchEventParams = {};

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.found).toBe(false);
    expect(parsed.error).toContain('artistId, venueId, or festivalId');
  });

  it('should include venue and artist details in results', async () => {
    const params: SearchEventParams = {
      artistId: 'artist-123',
    };

    mockApiRequest.mockResolvedValueOnce([
      {
        id: 'event-001',
        title: 'Live at The Venue',
        date: '2026-05-15',
        startTime: '20:00',
        endTime: '23:00',
        artistId: 'artist-123',
        artistName: 'The Band',
        venueId: 'venue-456',
        venueName: 'The Venue',
        venueCity: 'Manchester',
      },
    ]);

    const result = await searchEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.events[0]).toMatchObject({
      id: 'event-001',
      title: 'Live at The Venue',
      date: '2026-05-15',
      startTime: '20:00',
      endTime: '23:00',
      artistId: 'artist-123',
      artistName: 'The Band',
      venueId: 'venue-456',
      venueName: 'The Venue',
      venueCity: 'Manchester',
    });
  });
});
