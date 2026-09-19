/**
 * Brokered `WorkspaceHostAdapter`: routes every ApplicationX call through the
 * Calricula backend broker (`/api/applicationx/*`) rather than talking to
 * ApplicationX directly. The broker validates the Calricula session token
 * (`Authorization`) and forwards the ApplicationX resource token
 * (`X-ApplicationX-Token`) upstream, so every call needs both tokens — see
 * backend/app/api/routes/applicationx.py.
 */
import { eventsUrl, op, resolveContext as clientResolveContext, AXTokens } from './client';
import { subscribeSSE } from './sse';
import type { HostResolution, ProgramRef, WorkspaceEvent, WorkspaceHostAdapter, WorkspaceHostContext } from './types';

export type GetToken = (resource?: 'calricula' | 'applicationx') => Promise<string | null>;

export interface RouterLike {
  push(href: string): void;
}

export interface CreateBrokeredAdapterOptions {
  getToken: GetToken;
  router: RouterLike;
  standaloneUrl: string | null;
}

const SESSION_EXPIRED_RESOLUTION: HostResolution = {
  state: 'session_expired',
  message: 'Your session expired. Sign in again.',
  retryable: false,
};

function sessionExpiredError(): Error {
  return Object.assign(new Error('session_expired'), { code: 'session_expired' });
}

function unknownOperationError(operation: string): Error {
  return Object.assign(new Error(`unknown operation: ${operation}`), { code: 'unknown_operation' });
}

function missingSourceIdError(): Error {
  return Object.assign(new Error('sources.health requires a source_id'), { code: 'missing_source_id' });
}

async function resolveTokens(getToken: GetToken): Promise<AXTokens | null> {
  const [calricula, applicationx] = await Promise.all([getToken(), getToken('applicationx')]);
  if (!calricula || !applicationx) return null;
  return { calricula, applicationx };
}

export function createBrokeredAdapter({ getToken, router, standaloneUrl }: CreateBrokeredAdapterOptions): WorkspaceHostAdapter {
  return {
    async resolveContext(ctx: WorkspaceHostContext, signal: AbortSignal): Promise<HostResolution> {
      const tokens = await resolveTokens(getToken);
      if (!tokens) return SESSION_EXPIRED_RESOLUTION;
      return clientResolveContext(
        tokens,
        { program_id: ctx.program_ref?.external_id ?? null, workspace_id: ctx.workspace_id, context_id: ctx.context_id },
        signal,
      );
    },

    async request<T>(operation: string, parameters: Record<string, unknown>, signal: AbortSignal): Promise<T> {
      const tokens = await resolveTokens(getToken);
      if (!tokens) throw sessionExpiredError();

      switch (operation) {
        case 'chat.messages':
          return op<T>(tokens, operation, {}, parameters, signal);
        case 'chat.cancel':
          return op<T>(tokens, operation, { run_id: parameters.run_id as string }, null, signal);
        // GET /v1/sources — no path params, no body.
        case 'sources.list':
          return op<T>(tokens, operation, {}, null, signal);
        // GET /v1/sources/{source_id}/health — source_id is a required path
        // param at the broker (backend/app/services/applicationx_broker.py);
        // reject client-side rather than send a request the broker will 400.
        case 'sources.health':
          if (!parameters.source_id) throw missingSourceIdError();
          return op<T>(tokens, operation, { source_id: String(parameters.source_id) }, null, signal);
        default:
          throw unknownOperationError(operation);
      }
    },

    async *subscribe(resourceId: string, cursor: string | null, signal: AbortSignal): AsyncIterable<WorkspaceEvent> {
      const tokens = await resolveTokens(getToken);
      if (!tokens) throw sessionExpiredError();

      yield* subscribeSSE(
        fetch,
        eventsUrl(resourceId),
        { Authorization: `Bearer ${tokens.calricula}`, 'X-ApplicationX-Token': tokens.applicationx },
        cursor,
        signal,
      );
    },

    navigateToProgram(program: ProgramRef): void {
      router.push(`/programs/${program.external_id}`);
    },

    openStandalone(workspaceId: string): void {
      if (!standaloneUrl) return;
      window.open(`${standaloneUrl}/workspaces/${workspaceId}`, '_blank', 'noopener');
    },
  };
}
