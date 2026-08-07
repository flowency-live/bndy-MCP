// HTTP Client for BNDY API calls
// Replaces direct Lambda invocation with public API calls
//
// 2026-07-27 gate plan: non-2xx responses now throw ApiError with the REAL
// status code and parsed body. Tools must check err.status / err.body?.code —
// never substring-match the message (the old `.includes('404')` pattern is
// what routed artist creates into the no-dedup fallback on ANY error whose
// body mentioned "404").

const API_BASE_URL = 'https://api.bndy.co.uk';

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(status: number, rawBody: string) {
    let parsed: any = null;
    try { parsed = JSON.parse(rawBody); } catch { /* non-JSON body */ }
    super(`HTTP ${status}: ${parsed?.error || rawBody}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = parsed;
  }

  /** True when the server's hard uniqueness gate bounced the write. */
  get isDuplicate(): boolean {
    return this.status === 409 || this.body?.code === 'DUPLICATE';
  }
}

export async function apiRequest<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: any
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Service token for authenticated MCP write operations (venue creates, etc.)
  // Read from env only - never hardcode tokens.
  if (process.env.MCP_SERVICE_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.MCP_SERVICE_TOKEN}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  console.error(`[HTTP] ${method} ${path}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText);
  }

  return (await response.json()) as T;
}
