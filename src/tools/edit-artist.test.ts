// Edit Artist Tool Tests
// TDD: Write tests FIRST, then implement

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editArtist, EditArtistParams } from './edit-artist.js';

// Mock the HTTP client
vi.mock('../utils/http-client.js', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '../utils/http-client.js';
const mockApiRequest = vi.mocked(apiRequest);

describe('editArtist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update artist location successfully', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      location: 'Manchester, UK',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      location: 'Manchester, UK',
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.artist.location).toBe('Manchester, UK');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/artists/test-artist-123/mcp',
      'PUT',
      expect.objectContaining({ location: 'Manchester, UK' })
    );
  });

  it('should update artist genres successfully', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      genres: ['rock', 'indie', 'alternative'],
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      genres: ['rock', 'indie', 'alternative'],
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.artist.genres).toEqual(['rock', 'indie', 'alternative']);
  });

  it('should update social media URLs successfully', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      facebookUrl: 'https://facebook.com/testartist',
      instagramUrl: 'https://instagram.com/testartist',
      spotifyUrl: 'https://open.spotify.com/artist/123',
      websiteUrl: 'https://testartist.com',
      youtubeUrl: 'https://youtube.com/@testartist',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      facebookUrl: 'https://facebook.com/testartist',
      instagramUrl: 'https://instagram.com/testartist',
      spotifyUrl: 'https://open.spotify.com/artist/123',
      websiteUrl: 'https://testartist.com',
      youtubeUrl: 'https://youtube.com/@testartist',
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/artists/test-artist-123/mcp',
      'PUT',
      expect.objectContaining({
        facebookUrl: 'https://facebook.com/testartist',
        instagramUrl: 'https://instagram.com/testartist',
        spotifyUrl: 'https://open.spotify.com/artist/123',
        websiteUrl: 'https://testartist.com',
        youtubeUrl: 'https://youtube.com/@testartist',
      })
    );
  });

  it('should update bio successfully', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      bio: 'An amazing indie rock band from Manchester',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      bio: 'An amazing indie rock band from Manchester',
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.artist.bio).toBe('An amazing indie rock band from Manchester');
  });

  it('should update artist type successfully', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      artistType: 'duo',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      artist_type: 'duo',
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/artists/test-artist-123/mcp',
      'PUT',
      expect.objectContaining({ artistType: 'duo' })
    );
  });

  it('should handle multiple field updates in one call', async () => {
    const params: EditArtistParams = {
      artistId: 'test-artist-123',
      location: 'London, UK',
      genres: ['pop', 'electronic'],
      bio: 'Electronic duo from London',
      facebookUrl: 'https://facebook.com/duo',
    };

    mockApiRequest.mockResolvedValueOnce({
      id: 'test-artist-123',
      name: 'Test Artist',
      location: 'London, UK',
      genres: ['pop', 'electronic'],
      bio: 'Electronic duo from London',
      facebookUrl: 'https://facebook.com/duo',
    });

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/artists/test-artist-123/mcp',
      'PUT',
      expect.objectContaining({
        location: 'London, UK',
        genres: ['pop', 'electronic'],
        bio: 'Electronic duo from London',
        facebookUrl: 'https://facebook.com/duo',
      })
    );
  });

  it('should handle API errors gracefully', async () => {
    const params: EditArtistParams = {
      artistId: 'nonexistent-artist',
      location: 'Nowhere',
    };

    mockApiRequest.mockRejectedValueOnce(new Error('Artist not found'));

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Artist not found');
  });

  it('should require artistId', async () => {
    const params = {
      location: 'Manchester',
    } as EditArtistParams;

    const result = await editArtist(params);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('artistId');
  });
});
