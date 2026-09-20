# ApplicationX inside Calricula

Version: 0.4 | Date: 2026-09-20 | Status: Implemented (P1 foundation)

Binding extension to [technical specification](TECHNICAL-SPEC.md), implementing
[PRD](PRD.md) requirement AX-04. The owner authorized planning this interface.

## 1. Intended experience

Staff open **Employer & Career Collaboration** in Calricula's navigation or from
a program page. Calricula's navigation remains visible while the ApplicationX
workspace occupies the content area. Staff can review evidence, work with the
assistant, and use the collaboration features available in that release.

Students and employers enter through standalone ApplicationX. Authorized staff
can also open a workspace there. Both interfaces access the same ApplicationX
records and permission checks. Calipar receives the already planned evidence and
workflow integrations; a Calipar embedded view is outside AX-21.

## 2. Composition decision

Use a versioned shared React package owned by ApplicationX, proposed as
`packages/workspace-ui`. Calricula builds that package into its staff routes.
Standalone ApplicationX builds the same workspace components into its own layout.
ApplicationX's API, workers, source connectors and database remain independently
deployed. The Calricula host adds a scoped server-side API broker.

| Alternative | Assessment |
| --- | --- |
| Shared components plus typed API | Selected: native layout, focus, theme and navigation integration; requires package compatibility testing |
| Cross-origin iframe | Not selected: adds frame navigation, sizing and authentication coordination to the primary experience |
| External link only | Retained as an optional standalone entry; does not satisfy the in-Calricula requirement |

Pin package releases and compatible React/TypeScript peer dependencies. Avoid
runtime remote-module loading and duplicated page implementations. UI updates
reach Calricula through its normal build/test/release process. API compatibility
allows the two hosts to upgrade on separate schedules.

## 3. Routes and host contract

Proposed Calricula routes:

- `/collaboration`: authorized workspace/program selector.
- `/programs/[id]/collaboration`: program-specific workspace.

Implement against the main `frontend/src/app` application, using its established
layout and auth context. Do not target the independent `calricula_pwa_demo`.

```text
WorkspaceHostContext {
  host: calricula|applicationx,
  organization_ref, campus_ref,
  program_ref: null|{source_app, external_id, revision},
  workspace_id: null|uuid
}
WorkspaceHostAdapter {
  resolveContext(context) -> authorized context or typed state,
  request(operation, parameters) -> typed result,
  subscribe(resource_id, cursor) -> authorized event stream,
  navigateToProgram(program_ref), openStandalone(workspace_id)
}
```

These are proposed interfaces. Context is a selector, never proof of identity or
access. `POST /v1/host-contexts/resolve` validates the user, organization membership,
program crosswalk and source revision before returning an authorized workspace.
Mappings use source-qualified IDs, not program titles. In P1 the Calricula
program revision is the program's `updated_at` timestamp (ISO-8601 UTC) plus
its status; a monotonic revision counter arrives with AX-14 in P2. Organization
and campus references are Calricula deployment configuration because one
Calricula deployment serves one organization. Host program metadata must
come from a trusted server-side record or an authorized versioned import; browser
values alone cannot establish that the user can access a draft.

No mapping returns `mapping_required`; no membership returns `access_required`;
an incompatible revision returns `context_stale`. Mapping/provisioning is a
separate permitted staff action. Opening the embedded route does not automatically
create membership, create a workspace, or upload/share a draft COR.

## 4. Sign-in and transport

The integrated deployment uses one Logto (OpenID Connect) tenant shared by both
applications (ADR-0001). Calricula's auth client sends two short-lived access tokens to its API broker:
its own Calricula token in the Authorization header, and the token scoped to
the ApplicationX API resource (`getToken('applicationx')`) in
`X-ApplicationX-Token`. The broker is a FastAPI
router in Calricula's backend at `/api/applicationx/*`; it validates the
Calricula token with Calricula's existing auth dependency, forwards only the
ApplicationX-scoped token upstream (never the Calricula one), enriches
host-context requests with
the trusted program record from Calricula's database, and forwards only
allowlisted ApplicationX operations and parameters to a server-configured
upstream origin. ApplicationX independently
verifies issuer/audience and checks its own user memberships on every operation.

Calricula login, a client-supplied role, or a broad service credential does not
authorize an ApplicationX action. If a service credential is required for transport,
it supplements user identity and cannot expand the user's scope. Do not forward
ambient cookies, arbitrary URLs, or unrelated headers. Bound payload size and
request time; preserve typed errors and redact tokens from logs.

The shared UI does not persist bearer tokens or put them in URLs/context objects.
Use fetch-based authenticated SSE through the broker, with Authorization headers
and resumable event IDs. Configure and test streaming/proxy timeouts; disconnects
show reconnect state rather than losing the recorded task result.

Existing-user identity can avoid a second login inside Calricula; it does not
guarantee a shared browser session on the standalone origin. Standalone uses its
own auth client and may prompt for sign-in. Deployments with different Logto
tenants need a separately reviewed federation/token-exchange design before
promising coordinated sign-in. Never relax accepted audiences to simulate SSO.

## 5. Context, lifecycle and visibility

Display college, program and revision in the workspace header and assistant context.
Switching context aborts old client requests, clears scoped UI state, unsubscribes
old streams and rejects late results tagged with the previous context ID. Start
a fresh conversation unless the user explicitly requests a cross-program comparison.
That comparison requires authorization to each selected program/workspace.

Server-side agent runs retain their original immutable scope. Switching programs
does not retarget them or imply their cancellation; users can explicitly cancel
them. Persisted conversations remain bound to their originating workspace.
Browser back/forward and reload resolve context through the same server checks.

Preserve the selected Calricula program/revision when returning. Calricula
currently has no unsaved-change guard; the P1 entry point is the program detail
page, not an editor. ApplicationX must not add navigation that bypasses a save
flow and must not silently save, discard or modify an in-progress COR.

Calricula sign-out clears embedded state, closes streams and aborts client requests.
A separately open standalone session follows its own lifecycle; do not describe
local logout as global logout. Server-side account/membership revocation applies
to both views and to queued/running task authorization at the next protected action.

## 6. Layout, accessibility and failure handling

Calricula renders the outer navigation, page title and breadcrumbs. Shared
components render workspace content without duplicate navigation or extra main
landmarks. Use explicit theme tokens and scoped styles, preserving Calricula's
luminous light-only design and gold-ink contrast rules.

Keyboard navigation, focus restoration, screen-reader status announcements,
responsive tables and mobile-width workspace content must work inside the host layout.
Do not force users to interact with a graph canvas to access evidence. Offer
Open in ApplicationX for a standalone view of the same authorized workspace.

States: `loading`, `ready`, `access_required`, `mapping_required`,
`context_stale`, `session_expired`, `service_unavailable`, `version_mismatch`.
An outage shows inline retry/status and leaves Calricula's other routes working.
The standalone link cannot fix an outage of the shared backend. Never substitute
public or another workspace's data after an authorization failure.

The embed flag is organization-scoped. Disabling it removes the host entry while
leaving ApplicationX records and standalone access intact. UI/API incompatibility
disables affected functionality with an actionable status, not silent corruption.

## 7. Delivery sequence and acceptance

P0 defines package/transport/context contracts and synthetic fixtures. P1 builds
the host routes, navigation, identity configuration, context resolution, workspace content and
failure states. P2 exposes employer collaboration, tasks, agents and evidence
exchange in the same embedded view. Later CLI-data features become available
according to their existing PRD phases; AX-21 does not reduce their scope.

Before implementation, inspect Calricula's current layout/auth/editor patterns
and assign exact affected files in the P1 plan. Keep the package, ApplicationX
service and Calricula host changes as separately testable deliverables.

Required acceptance cases:

1. A permitted staff user enters from both global and program navigation and
   uses the workspace without leaving Calricula's layout or repeating embedded sign-in.
2. A valid Calricula user lacking ApplicationX access receives no workspace data.
3. Tampered organization/program/revision selectors fail server-side checks.
4. Missing mappings require explicit setup and do not silently provision access.
5. A context switch cannot display prior-program answers or retarget a running bot.
6. Reload, back/forward, unsaved editor navigation and return-to-program work.
7. Logout, token expiry, revocation and SSE reconnect preserve access boundaries.
8. Keyboard, screen-reader and narrow-screen tasks work with Calricula's layout.
9. ApplicationX outage or incompatible API/package leaves curriculum editing usable.
10. Standalone and embedded views show the same authorized record revisions; guests
    remain restricted regardless of which host or API route they attempt to use.

For implementation, run Calricula's required backend/frontend checks plus shared
package tests and cross-host integration tests. This documentation update does
not implement routes, deploy an identity configuration, or change running services.
