/**
 * Host contracts come from the shared package (`@johnnyrobot/workspace-ui`,
 * installed from GitHub Packages — see docs/APPLICATIONX-EMBED.md). This
 * module re-exports them so the rest of Calricula keeps importing from
 * `@/lib/applicationx/types`. Calricula-only types (`AXStatus`, `AXTokens`)
 * live in `./client`.
 */
export type {
  HostKind,
  ProgramRef,
  WorkspaceHostContext,
  HostState,
  ResolvedContext,
  HostFailure,
  HostResolution,
  WorkspaceEvent,
  WorkspaceHostAdapter,
  Citation,
  ChatAnswer,
} from '@johnnyrobot/workspace-ui';
