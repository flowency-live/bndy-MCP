// Record Run Tool - MCP Implementation
// Records source run metrics to the source-runs API for the Agent Work dashboard
// API: PUT /api/source-runs/{sourceId}/{runId}

const API_BASE = 'https://api.bndy.co.uk';

// Token from environment - NOT hardcoded (workorder T1 requirement)
function getSourceRunsToken(): string {
  const token = process.env.SOURCE_RUNS_TOKEN;
  if (!token) {
    throw new Error('SOURCE_RUNS_TOKEN environment variable is not set');
  }
  return token;
}

interface SourceRunCounts {
  // Load metrics
  rawRows?: number;        // rows captured from the source this run
  validEvents?: number;    // rows surviving the §0 filters
  parkedRows?: number;     // rows skipped, with reason in the report

  // Creation metrics (verified creates only - read back per §0.10)
  eventsCreated?: number;
  venuesCreated?: number;
  artistsCreated?: number;

  // Match metrics
  venuesMatched?: number;
  artistsMatched?: number;

  // Cleanup metrics (§0.17 outcomes)
  eventsDeleted?: number;
  eventsHidden?: number;
  cancelled?: number;
  pastDropped?: number;

  // Review metrics
  reviewItems?: number;
}

interface RecordRunParams {
  sourceId: string;        // canonical slug, RUNBOOK §6D table
  runId: string;           // unique per run, e.g. "2026-08-07T04-30-00Z"
  runDate: string;         // YYYY-MM-DD
  status: 'started' | 'completed' | 'failed';
  counts: SourceRunCounts;
  note?: string;           // <=200 chars, the line a human reads first
  reportPath?: string;     // vault path to the full RUN-REPORT.md
  errors?: { message: string; code?: string }[];
}

interface RecordRunResponse {
  sourceId: string;
  runId: string;
  status: string;
  updatedAt: string;
}

export async function recordRun(params: RecordRunParams): Promise<string> {
  const { sourceId, runId, runDate, status, counts, note, reportPath, errors } = params;

  // Validate required parameters
  if (!sourceId) {
    return JSON.stringify({
      success: false,
      error: 'sourceId is required',
      message: 'Provide the canonical source slug from RUNBOOK §6D table',
    }, null, 2);
  }

  if (!runId) {
    return JSON.stringify({
      success: false,
      error: 'runId is required',
      message: 'Provide a unique run identifier (e.g., "2026-08-07T04-30-00Z")',
    }, null, 2);
  }

  if (!runDate) {
    return JSON.stringify({
      success: false,
      error: 'runDate is required',
      message: 'Provide the run date in YYYY-MM-DD format',
    }, null, 2);
  }

  if (!status || !['started', 'completed', 'failed'].includes(status)) {
    return JSON.stringify({
      success: false,
      error: 'invalid status',
      message: 'Status must be one of: started, completed, failed',
    }, null, 2);
  }

  if (!counts || typeof counts !== 'object') {
    return JSON.stringify({
      success: false,
      error: 'counts is required',
      message: 'Provide counts object with run metrics',
    }, null, 2);
  }

  // Validate note length
  if (note && note.length > 200) {
    return JSON.stringify({
      success: false,
      error: 'note too long',
      message: 'Note must be <=200 characters',
    }, null, 2);
  }

  console.error(`[record_run] Recording ${status} for ${sourceId}/${runId}`);

  try {
    const token = getSourceRunsToken();

    const url = `${API_BASE}/api/source-runs/${encodeURIComponent(sourceId)}/${encodeURIComponent(runId)}`;

    const body = {
      runDate,
      status,
      counts,
      ...(note && { note }),
      ...(reportPath && { reportPath }),
      ...(errors && errors.length > 0 && { errors }),
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorBody;
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { message: errorText };
      }

      console.error(`[record_run] API error ${response.status}:`, errorBody);

      return JSON.stringify({
        success: false,
        error: `HTTP ${response.status}`,
        message: errorBody.error || errorBody.message || errorText,
      }, null, 2);
    }

    const result = await response.json() as RecordRunResponse;

    console.error(`[record_run] Recorded: ${result.sourceId}/${result.runId} -> ${result.status}`);

    return JSON.stringify({
      success: true,
      sourceId: result.sourceId,
      runId: result.runId,
      status: result.status,
      message: `Run ${status} recorded for ${sourceId}`,
    }, null, 2);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[record_run] Error:`, error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
      message: 'Failed to record run',
    }, null, 2);
  }
}
