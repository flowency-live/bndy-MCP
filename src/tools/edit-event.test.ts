// Edit Event Tool Tests
// TDD: Write tests FIRST, then implement

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editEvent, EditEventParams } from './edit-event.js';

// Mock the HTTP client
vi.mock('../utils/http-client.js', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../utils/http-client.js';
const mockApiRequest = vi.mocked(apiRequest);

describe('editEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update event title successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      title: 'Summer Music Festival',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Summer Music Festival',
      date: '2025-07-15',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.title).toBe('Summer Music Festival');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/events/test-event-123/mcp',
      'PUT',
      expect.objectContaining({ title: 'Summer Music Festival' })
    );
  });

  it('should update event date successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      date: '2025-08-20',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      date: '2025-08-20',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.date).toBe('2025-08-20');
  });

  it('should update event time successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      startTime: '20:30',
      endTime: '23:00',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      startTime: '20:30',
      endTime: '23:00',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.startTime).toBe('20:30');
    expect(parsed.event.endTime).toBe('23:00');
  });

  it('should update event ticket information successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      ticketed: true,
      ticketUrl: 'https://tickets.example.com/event123',
      ticketInformation: 'Tickets available online',
      price: '£15',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      ticketed: true,
      ticketUrl: 'https://tickets.example.com/event123',
      ticketinformation: 'Tickets available online',
      price: '£15',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.ticketed).toBe(true);
  });

  it('should update event image URL successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://bndy-images.s3.eu-west-2.amazonaws.com/events/poster.jpg',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      imageUrl: 'https://bndy-images.s3.eu-west-2.amazonaws.com/events/poster.jpg',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.imageUrl).toBe('https://bndy-images.s3.eu-west-2.amazonaws.com/events/poster.jpg');
  });

  it('should update event description successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      description: 'An amazing night of live music featuring local bands',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      description: 'An amazing night of live music featuring local bands',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.description).toBe('An amazing night of live music featuring local bands');
  });

  it('should handle API errors gracefully', async () => {
    const params: EditEventParams = {
      eventId: 'nonexistent-event',
      title: 'Updated Title',
    };

    mockApiRequest.mockRejectedValueOnce(new Error('Event not found'));

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Event not found');
  });

  it('should require eventId', async () => {
    const params = {
      title: 'Updated Title',
    } as EditEventParams;

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('eventId');
  });

  it('should update event venueId successfully', async () => {
    const params: EditEventParams = {
      eventId: 'test-event-123',
      venueId: 'new-venue-456',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-event-123',
      title: 'Live Music Night',
      date: '2026-05-15',
      venueId: 'new-venue-456',
      venueName: 'The New Venue',
    });

    const result = await editEvent(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.event.venueId).toBe('new-venue-456');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/events/test-event-123/mcp',
      'PUT',
      expect.objectContaining({ venueId: 'new-venue-456' })
    );
  });
});
