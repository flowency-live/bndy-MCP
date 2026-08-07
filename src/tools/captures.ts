// Captures Tools - MCP Implementation
// Read/write to the bndy-captures table via the capture API
// API: https://4989v5e3e5.execute-api.eu-west-2.amazonaws.com

const CAPTURE_API_BASE = 'https://4989v5e3e5.execute-api.eu-west-2.amazonaws.com';
// Token from env - never hardcode secrets in source
const CAPTURE_TOKEN = process.env.CAPTURE_TOKEN || '';

interface Capture {
  id: string;
  status: string;
  receivedAt: string;
  capturedAt: string;
  updatedAt?: string;
  sharedText?: string;
  sharedUrl?: string;
  sourceApp?: string;
  mimeType?: string;
  suggestedEntityType?: string;
  rawPayload?: Record<string, unknown>;
  notes?: string;
}

interface ListCapturesParams {
  status?: string; // Filter by status (e.g., "unprocessed", "processed")
  limit?: number;
}

interface GetCaptureParams {
  id: string;
}

interface UpdateCaptureStatusParams {
  id: string;
  status: string;
}

interface AddCaptureNotesParams {
  id: string;
  notes: string;
}

async function captureApiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown
): Promise<T> {
  const url = `${CAPTURE_API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CAPTURE_TOKEN}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Capture API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function listCaptures(params: ListCapturesParams): Promise<string> {
  const { status, limit } = params;

  console.error(`[list_captures] Listing captures${status ? ` with status="${status}"` : ''}`);

  try {
    const queryParams = new URLSearchParams();
    if (status) queryParams.set('status', status);
    if (limit) queryParams.set('limit', String(limit));

    const queryString = queryParams.toString();
    const path = `/v1/captures${queryString ? `?${queryString}` : ''}`;

    const response = await captureApiRequest<{ items: Capture[] }>(path);

    console.error(`[list_captures] Found ${response.items?.length || 0} captures`);

    return JSON.stringify({
      success: true,
      count: response.items?.length || 0,
      captures: response.items || [],
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[list_captures] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to list captures',
    }, null, 2);
  }
}

export async function getCapture(params: GetCaptureParams): Promise<string> {
  const { id } = params;

  if (!id) {
    return JSON.stringify({
      success: false,
      error: 'id is required',
      message: 'You must provide a capture id',
    }, null, 2);
  }

  console.error(`[get_capture] Getting capture: ${id}`);

  try {
    const response = await captureApiRequest<Capture>(`/v1/captures/${id}`);

    console.error(`[get_capture] Found capture: ${response.id}`);

    return JSON.stringify({
      success: true,
      capture: response,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[get_capture] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to get capture',
    }, null, 2);
  }
}

export async function updateCaptureStatus(params: UpdateCaptureStatusParams): Promise<string> {
  const { id, status } = params;

  if (!id) {
    return JSON.stringify({
      success: false,
      error: 'id is required',
      message: 'You must provide a capture id',
    }, null, 2);
  }

  if (!status) {
    return JSON.stringify({
      success: false,
      error: 'status is required',
      message: 'You must provide a new status',
    }, null, 2);
  }

  console.error(`[update_capture_status] Updating capture ${id} status to: ${status}`);

  try {
    const response = await captureApiRequest<Capture>(
      `/v1/captures/${id}/status`,
      'PATCH',
      { status }
    );

    console.error(`[update_capture_status] Updated capture: ${response.id}`);

    return JSON.stringify({
      success: true,
      capture: response,
      message: `Capture status updated to "${status}"`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[update_capture_status] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to update capture status',
    }, null, 2);
  }
}

export async function addCaptureNotes(params: AddCaptureNotesParams): Promise<string> {
  const { id, notes } = params;

  if (!id) {
    return JSON.stringify({
      success: false,
      error: 'id is required',
      message: 'You must provide a capture id',
    }, null, 2);
  }

  if (!notes) {
    return JSON.stringify({
      success: false,
      error: 'notes is required',
      message: 'You must provide notes to add',
    }, null, 2);
  }

  console.error(`[add_capture_notes] Adding notes to capture ${id}`);

  try {
    const response = await captureApiRequest<Capture>(
      `/v1/captures/${id}/notes`,
      'POST',
      { note: notes }  // Lambda expects "note" (singular)
    );

    console.error(`[add_capture_notes] Added notes to capture: ${response.id}`);

    return JSON.stringify({
      success: true,
      capture: response,
      message: 'Notes added to capture',
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[add_capture_notes] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to add notes to capture',
    }, null, 2);
  }
}
