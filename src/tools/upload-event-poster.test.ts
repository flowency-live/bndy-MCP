// Upload Event Poster Tool Tests
// TDD: Write tests FIRST, then implement

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the S3 client before importing the module
const mockSend = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/client-s3', () => {
  // Create proper class mocks for AWS SDK inside the factory function
  // Using actual class syntax to satisfy the 'new' keyword requirement
  class MockS3Client {
    send = mockSend;
  }

  class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
  };
});

// Mock fetch for downloading images
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks are set up
import { uploadEventPoster, UploadEventPosterParams, resetS3Client } from './upload-event-poster.js';

describe('uploadEventPoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
    resetS3Client(); // Reset the lazy-initialized client
  });

  it('should upload event poster from URL successfully', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://example.com/poster.jpg',
    };

    // Mock successful image download
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(1024)),
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.s3Url).toContain('bndy-images.s3.eu-west-2.amazonaws.com');
    expect(parsed.s3Url).toContain('event-posters');
    expect(parsed.s3Url).toContain('test-event-123');
  });

  it('should generate correct S3 key with event ID', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'my-event-456',
      imageUrl: 'https://example.com/image.png',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(512)),
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.s3Key).toContain('my-event-456');
  });

  it('should handle different image formats', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://example.com/poster.webp',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'image/webp' }),
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(2048)),
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.contentType).toBe('image/webp');
  });

  it('should reject non-image content types', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://example.com/document.pdf',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(1024)),
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('image');
  });

  it('should handle download failure gracefully', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://example.com/nonexistent.jpg',
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('download');
  });

  it('should require eventId', async () => {
    const params = {
      imageUrl: 'https://example.com/poster.jpg',
    } as UploadEventPosterParams;

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('eventId');
  });

  it('should require imageUrl', async () => {
    const params = {
      eventId: 'test-event-123',
    } as UploadEventPosterParams;

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('imageUrl');
  });

  it('should handle files that are too large', async () => {
    const params: UploadEventPosterParams = {
      eventId: 'test-event-123',
      imageUrl: 'https://example.com/huge-poster.jpg',
    };

    // Create a large buffer (over 10MB)
    const largeBuffer = new ArrayBuffer(11 * 1024 * 1024);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: vi.fn().mockResolvedValueOnce(largeBuffer),
    });

    const result = await uploadEventPoster(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('large');
  });
});
