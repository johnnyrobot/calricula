/**
 * Mirrors @applicationx/workspace-ui contracts; replaced by a re-export when
 * the package is a dependency.
 *
 * Source: applicationx/packages/workspace-ui/src/contracts/host.ts. Plain
 * interfaces/types only — Calricula does not depend on zod, so the runtime
 * schema exports from that file are intentionally omitted.
 */

export type HostKind = 'calricula' | 'applicationx';

export interface ProgramRef {
  source_app: 'calricula' | 'calipar';
  external_id: string;
  revision: string;
}

export interface WorkspaceHostContext {
  host: HostKind;
  organization_ref: string;
  campus_ref: string;
  program_ref: ProgramRef | null;
  workspace_id: string | null;
  context_id: string;
}

export type HostState =
  | 'loading'
  | 'ready'
  | 'access_required'
  | 'mapping_required'
  | 'context_stale'
  | 'session_expired'
  | 'service_unavailable'
  | 'version_mismatch';

export interface ResolvedContext {
  state: 'ready';
  workspace_id: string;
  workspace_title: string;
  program_title: string | null;
  campus_label: string;
  revision_label: string;
  api_version: string;
}

export interface HostFailure {
  state: Exclude<HostState, 'ready' | 'loading'>;
  message: string;
  retryable: boolean;
}

export type HostResolution = ResolvedContext | HostFailure;

export interface WorkspaceEvent {
  id: string;
  type: string;
  context_id: string;
  payload: unknown;
}

export interface WorkspaceHostAdapter {
  resolveContext(ctx: WorkspaceHostContext, signal: AbortSignal): Promise<HostResolution>;
  request<T>(operation: string, parameters: Record<string, unknown>, signal: AbortSignal): Promise<T>;
  subscribe(resourceId: string, cursor: string | null, signal: AbortSignal): AsyncIterable<WorkspaceEvent>;
  navigateToProgram(program: ProgramRef): void;
  openStandalone(workspaceId: string): void;
}
