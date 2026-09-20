import type { HostFailure, HostResolution } from './types';

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

/** Host failure states this version of the UI knows how to render. Mirrors
 * `HOST_FAILURE_STATES` in backend/app/services/applicationx_broker.py. */
export const KNOWN_FAILURE_STATES: ReadonlySet<string> = new Set<HostFailure['state']>([
  'access_required',
  'mapping_required',
  'context_stale',
  'session_expired',
  'service_unavailable',
  'version_mismatch',
]);

export const SESSION_EXPIRED_RESOLUTION: HostFailure = {
  state: 'session_expired',
  message: 'Your session expired. Sign in again.',
  retryable: false,
};

/** A valid Calricula session but no ApplicationX token: the deployment has
 * not configured `LOGTO_APPLICATIONX_RESOURCE` (or the tenant refused it).
 * Signing in again cannot fix that, so it is reported as an outage. */
export const NOT_CONFIGURED_RESOLUTION: HostFailure = {
  state: 'service_unavailable',
  message: 'ApplicationX sign-in is not configured for this deployment.',
  retryable: false,
};

export const VERSION_MISMATCH_RESOLUTION: HostFailure = {
  state: 'version_mismatch',
  message: 'ApplicationX returned a response this version of Calricula cannot display.',
  retryable: false,
};

/** Maps the two-token lookup to a host failure when either is missing, or
 * `null` when both are present. Shared by the adapter and the pages so the
 * misconfiguration message stays consistent. */
export function missingTokenResolution(calricula: string | null, applicationx: string | null): HostFailure | null {
  if (!calricula) return SESSION_EXPIRED_RESOLUTION;
  if (!applicationx) return NOT_CONFIGURED_RESOLUTION;
  return null;
}

/** Standalone ApplicationX URL for one workspace; `null` when the deployment
 * has no standalone URL. Single builder for the banner and the adapter. */
export function workspaceStandaloneUrl(standaloneUrl: string | null, workspaceId: string): string | null {
  if (!standaloneUrl) return null;
  return `${standaloneUrl.replace(/\/+$/, '')}/workspaces/${encodeURIComponent(workspaceId)}`;
}

function asKnownResolution(data: unknown): HostResolution {
  if (!data || typeof data !== 'object') return VERSION_MISMATCH_RESOLUTION;
  const state = (data as { state?: unknown }).state;
  if (state === 'ready') return data as HostResolution;
  if (typeof state !== 'string' || !KNOWN_FAILURE_STATES.has(state)) return VERSION_MISMATCH_RESOLUTION;
  const { message, retryable } = data as { message?: unknown; retryable?: unknown };
  return {
    state: state as HostFailure['state'],
    message: typeof message === 'string' ? message : '',
    retryable: retryable === true,
  };
}

/** The broker relays a typed upstream 4xx as `{ detail: { state, message,
 * retryable } }` (already allowlisted server-side); anything else is opaque. */
function typedFailureFrom4xx(body: unknown): HostFailure | null {
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : null;
  if (!detail || typeof detail !== 'object') return null;
  const state = (detail as { state?: unknown }).state;
  if (typeof state !== 'string' || !KNOWN_FAILURE_STATES.has(state)) return null;
  return asKnownResolution(detail) as HostFailure;
}

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
  if (r.status === 401) return SESSION_EXPIRED_RESOLUTION;
  if ([502, 503, 504].includes(r.status)) {
    return { state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true };
  }
  if (!r.ok) {
    if (r.status >= 400 && r.status < 500) {
      let body: unknown = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      const typed = typedFailureFrom4xx(body);
      if (typed) return typed;
    }
    return { state: 'service_unavailable', message: 'ApplicationX returned an unexpected response.', retryable: false };
  }
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    return VERSION_MISMATCH_RESOLUTION;
  }
  return asKnownResolution(data);
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

export const eventsUrl = (workspaceId: string) => `${apiBase()}/api/applicationx/workspaces/${encodeURIComponent(workspaceId)}/events`;
