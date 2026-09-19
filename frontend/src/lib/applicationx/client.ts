import type { HostResolution } from './types';

export interface AXStatus {
  enabled: boolean;
  organization_ref: string | null;
  campus_ref: string | null;
  standalone_url: string | null;
  api_version: string | null;
}

/** Two tokens the broker requires: the Calricula session token (validated by
 * `Authorization`) and the ApplicationX resource token forwarded upstream via
 * `X-ApplicationX-Token`. See backend/app/api/routes/applicationx.py. */
export interface AXTokens {
  calricula: string;
  applicationx: string;
}

// Same expression api.ts:9 uses for its base URL.
export const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const brokerHeaders = (tokens: AXTokens) => ({
  Authorization: `Bearer ${tokens.calricula}`,
  'X-ApplicationX-Token': tokens.applicationx,
  'Content-Type': 'application/json',
});

export async function getStatus(token: string): Promise<AXStatus> {
  const r = await fetch(`${apiBase()}/api/applicationx/status`, { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

export async function resolveContext(
  tokens: AXTokens,
  body: { program_id: string | null; workspace_id: string | null; context_id: string },
  signal: AbortSignal,
): Promise<HostResolution> {
  let r: Response;
  try {
    r = await fetch(`${apiBase()}/api/applicationx/host-contexts/resolve`, {
      method: 'POST',
      headers: brokerHeaders(tokens),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { state: 'service_unavailable', message: 'ApplicationX could not be reached.', retryable: true };
  }
  if (r.status === 401) return { state: 'session_expired', message: 'Your session expired. Sign in again.', retryable: false };
  if ([502, 503, 504].includes(r.status)) {
    return { state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true };
  }
  if (!r.ok) return { state: 'service_unavailable', message: 'ApplicationX returned an unexpected response.', retryable: false };
  return r.json();
}

export async function op<T>(
  tokens: AXTokens,
  operation: string,
  path_params: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const r = await fetch(`${apiBase()}/api/applicationx/ops/${operation}`, {
    method: 'POST',
    headers: brokerHeaders(tokens),
    body: JSON.stringify({ path_params, body }),
    signal,
  });
  if (r.status === 401) throw Object.assign(new Error('session_expired'), { code: 'session_expired' });
  if (!r.ok) {
    throw Object.assign(new Error(`op ${operation} ${r.status}`), {
      code: r.status >= 500 ? 'service_unavailable' : 'rejected',
      status: r.status,
    });
  }
  return r.json();
}

export const eventsUrl = (runId: string) => `${apiBase()}/api/applicationx/runs/${encodeURIComponent(runId)}/events`;
