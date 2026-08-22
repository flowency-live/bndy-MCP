// Delete Artist Tool - MCP Implementation
// Calls DELETE /api/artists/:id/mcp (requires backend route to be deployed)
// Safety: backend should only allow deletion of AI-created/source-imported artists

import { apiRequest } from '../utils/http-client.js';

export interface DeleteArtistParams {
  artistId: string;
}

interface DeleteArtistResponse {
  message: string;
  id?: string;
}

export async function deleteArtist(params: DeleteArtistParams): Promise<string> {
  const { artistId } = params;

  if (!artistId) {
    return JSON.stringify({
      success: false,
      error: 'artistId is required',
      message: 'You must provide an artistId to delete an artist',
    }, null, 2);
  }

  console.error(`[delete_artist] Deleting artist via /mcp: ${artistId}`);

  try {
    const response = await apiRequest<DeleteArtistResponse>(
      `/api/artists/${artistId}/mcp`,
      'DELETE'
    );

    console.error(`[delete_artist] Successfully deleted artist: ${artistId}`);

    return JSON.stringify({
      success: true,
      deletedArtistId: artistId,
      message: response.message || `Artist ${artistId} has been permanently removed.`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[delete_artist] Error:`, error);

    if (errorMessage.includes('403')) {
      return JSON.stringify({
        success: false,
        error: 'NOT_SOURCE_IMPORTED',
        message: `Artist ${artistId} is not source-imported. MCP delete is restricted to AI-created/source-imported artists.`,
      }, null, 2);
    }

    if (errorMessage.includes('404')) {
      return JSON.stringify({
        success: false,
        error: 'ARTIST_NOT_FOUND',
        message: `Artist ${artistId} not found (or DELETE /api/artists/:id/mcp route not deployed yet).`,
      }, null, 2);
    }

    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to delete artist',
    }, null, 2);
  }
}
