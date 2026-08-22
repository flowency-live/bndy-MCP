// Edit Venue Tool Tests
// TDD: Write tests FIRST, then implement

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editVenue, EditVenueParams } from './edit-venue.js';

// Mock the HTTP client
vi.mock('../utils/http-client.js', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../utils/http-client.js';
const mockApiRequest = vi.mocked(apiRequest);

describe('editVenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update venue website successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      website: 'https://thepub.co.uk',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      website: 'https://thepub.co.uk',
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.venue.website).toBe('https://thepub.co.uk');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/venues/test-venue-123/mcp',
      'PUT',
      expect.objectContaining({ website: 'https://thepub.co.uk' })
    );
  });

  it('should update venue social media URLs successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      socialMediaUrls: [
        { platform: 'facebook', url: 'https://facebook.com/thepub' },
        { platform: 'instagram', url: 'https://instagram.com/thepub' },
      ],
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      social_media_urls: [
        { platform: 'facebook', url: 'https://facebook.com/thepub' },
        { platform: 'instagram', url: 'https://instagram.com/thepub' },
      ],
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/venues/test-venue-123/mcp',
      'PUT',
      expect.objectContaining({
        socialMediaUrls: [
          { platform: 'facebook', url: 'https://facebook.com/thepub' },
          { platform: 'instagram', url: 'https://instagram.com/thepub' },
        ],
      })
    );
  });

  it('should update venue phone number successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      phone: '01onal202 123456',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      phone: '01202 123456',
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
  });

  it('should update venue facilities successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      facilities: ['wifi', 'parking', 'food', 'disabled_access'],
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      facilities: ['wifi', 'parking', 'food', 'disabled_access'],
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.venue.facilities).toEqual(['wifi', 'parking', 'food', 'disabled_access']);
  });

  it('should update venue ticket info successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      standardTicketed: true,
      standardTicketUrl: 'https://tickets.thepub.co.uk',
      standardTicketInformation: 'Tickets available online or on the door',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      standard_ticketed: true,
      standard_ticket_url: 'https://tickets.thepub.co.uk',
      standard_ticket_information: 'Tickets available online or on the door',
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
  });

  it('should update venue profile image successfully', async () => {
    const params: EditVenueParams = {
      venueId: 'test-venue-123',
      profileImageUrl: 'https://bndy-images.s3.eu-west-2.amazonaws.com/venues/test.jpg',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-venue-123',
      name: 'The Pub',
      profile_image_url: 'https://bndy-images.s3.eu-west-2.amazonaws.com/venues/test.jpg',
    });

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.venue.profileImageUrl).toBe('https://bndy-images.s3.eu-west-2.amazonaws.com/venues/test.jpg');
  });

  it('should handle API errors gracefully', async () => {
    const params: EditVenueParams = {
      venueId: 'nonexistent-venue',
      website: 'https://nowhere.com',
    };

    mockApiRequest.mockRejectedValueOnce(new Error('Venue not found'));

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Venue not found');
  });

  it('should require venueId', async () => {
    const params = {
      website: 'https://example.com',
    } as EditVenueParams;

    const result = await editVenue(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('venueId');
  });
});
