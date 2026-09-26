# Tasks 5 and 6 report — nav item + program action; host-state components + collaboration routes

Branch `feat/applicationx-host`. Status: **DONE**.

| Task | Commit | Message |
|---|---|---|
| 5 | `dec9e38` | feat(frontend): Employer & Career Collaboration nav item and program action, gated by embed status |
| 6 | `08c8ba2` | feat(frontend): collaboration routes with server-resolved host states and context banner |

## Task 5 — what was implemented

- `frontend/src/components/layout/PageShell.tsx`
  - `NavItem.requiresApplicationX?: boolean`.
  - New entry `{ name: 'Employer & Career Collaboration', href: '/collaboration', icon: BriefcaseIcon, iconActive: BriefcaseIconSolid, requiresApplicationX: true }` at index 5 (after LMI Data, before BLS Data). Both heroicons were already imported.
  - `useApplicationXStatus()` is called unconditionally at the top of `PageShell`; `applicationXEnabled = axStatus?.enabled === true` is passed to both `Sidebar` instances (desktop + mobile). The `Sidebar` filter's first clause is `if (item.requiresApplicationX && !applicationXEnabled) return false;` so the entry is absent when disabled, or while the status is still unknown (`null`).
- `frontend/src/app/programs/[id]/page.tsx`
  - `useApplicationXStatus()` at top level; a `luminous-button-secondary` `Link` "Collaboration" with `BriefcaseIcon` (`aria-hidden`) to `/programs/${program.id}/collaboration`, rendered for every program status, placed before Export PDF inside the `flex items-center gap-3` div.
- Test: `frontend/src/components/layout/__tests__/PageShell.applicationx.test.tsx` (4 tests: enabled shows link with href; disabled hides; unknown/loading hides; other nav items unaffected). Mocks `@/contexts/AuthContext`, `@/hooks/useApplicationXStatus`, `@/components/notifications` (the actual import path in PageShell, not `.../NotificationBell`) and `@/components/theme` (ThemeToggle throws without a ThemeProvider).

### TDD evidence (Task 5)

RED — `npx jest src/components/layout/__tests__/PageShell.applicationx.test.tsx --coverage=false`:
```
TestingLibraryElementError: Unable to find an accessible element with the role "link" and name `/Employer & Career Collaboration/`
Tests:       1 failed, 3 passed, 4 total
```
GREEN — same command after implementation:
```
✓ nav shows collaboration only when embed enabled
✓ nav hides collaboration when disabled
✓ nav hides collaboration while status is unknown
✓ other nav items still render regardless of embed status
Tests:       4 passed, 4 total
```

## Task 6 — what was implemented

Components (`frontend/src/components/applicationx/`):
- `HostStatePanel.tsx` — props `{ resolution: HostFailure; onRetry; standaloneUrl }` (type-level guarantee it never receives `ResolvedContext`). A `luminous-card` `<section aria-labelledby>` with `role="alert"` for `session_expired` and `service_unavailable`. Copy per state:
  - `access_required`: "You do not have ApplicationX access for this organization." + "How to request access" heading + the server message; no `mailto:`, no retry.
  - `mapping_required`: "This program is not mapped to an ApplicationX workspace." + "Ask an ApplicationX administrator to map it, then return here."
  - `context_stale`: heading + server message + Retry.
  - `session_expired`: alert + "Sign in again" link to `/login`.
  - `service_unavailable`: alert + message + "Curriculum editing is unaffected." (`text-gold-ink`) + Retry only when `retryable`.
  - `version_mismatch`: explanatory text + "Open in ApplicationX" (`target="_blank" rel="noopener noreferrer"`, sr-only "opens in a new tab") when `standaloneUrl` is set.
  - Retry is `<button type="button" className="luminous-button-secondary">`.
- `ContextBanner.tsx` — `<div role="region" aria-label="Workspace context">` with a `<dl>` of College / Program / Revision, "Back to program" link, and "Open in ApplicationX" (`_blank`, `noopener noreferrer`) when a URL exists.
- `WorkspaceSelector.tsx` — per controller resolution 1: a `luminous-card` with "Open a program page and choose Collaboration to enter its workspace." and a "Go to Programs" link to `/programs`. No program list, no `onSelect` prop (YAGNI — nothing would call it).
- `index.ts` barrel.

Pages:
- `frontend/src/app/collaboration/page.tsx` — `'use client'`, `PageShell`, `<h1>Employer & Career Collaboration</h1>`. On mount (once `isAuthenticated`) resolves `{ program_id: null, workspace_id: null, context_id: 'collaboration:root' }` with both tokens. `ready` or `mapping_required` → `WorkspaceSelector`; any other failure → `HostStatePanel` (Retry re-resolves). Sign-out aborts and shows `session_expired`.
- `frontend/src/app/programs/[id]/collaboration/page.tsx` — `'use client'`, `PageShell`. Loads the program via `api.setToken(await getToken())` + `api.getProgram(id)` (the same pattern the program detail page uses), computes `context_id = `${p.id}:${p.updated_at}``, one `AbortController` per context (the previous one is aborted before a new resolve), `latestContext` ref so a late response for a superseded context is dropped, tokens from `getToken()` and `getToken('applicationx')` (either `null` → `session_expired`). Renders `ContextBanner` + placeholder `luminous-card` "Workspace ready. Chat arrives with the shared package." on `ready`, `role="status"` "Checking workspace access…" while loading, else `HostStatePanel`. A program-load failure shows a `role="alert"` card. On sign-out (`user` null) aborts, clears the context ref and shows `session_expired`. Back link is `/programs/${id}`. No second `<main>`.

Tests (`frontend/src/components/applicationx/__tests__/`):
- `HostStatePanel.test.tsx` — 9 tests: copy per state, Retry calls `onRetry` and is `type="button"`, alert roles, `/login` link, standalone link attributes and absence, and the "forced ready-shaped object never renders workspace_title / workspace_id" test.
- `HostStatePanel.a11y.test.tsx` — `jest-axe` on `service_unavailable`, `access_required`, `session_expired`; `expect.extend(toHaveNoViolations)` added in the file (not global in `jest.setup.js`, matching the existing `ccn` a11y tests).
- `ContextBanner.test.tsx` — 2 tests (region label, content, links; standalone link omitted without URL).
- `WorkspaceSelector.test.tsx` — 1 test.

### TDD evidence (Task 6)

RED — `npx jest src/components/applicationx --coverage=false`:
```
Cannot find module '../ContextBanner' ...
Cannot find module '../WorkspaceSelector' ...
Cannot find module '../HostStatePanel' ... (x2)
Test Suites: 4 failed, 4 total
```
GREEN — after implementation:
```
Test Suites: 4 passed, 4 total
Tests:       15 passed, 15 total
```

## Verification (from `frontend/`)

- `npm test` → `Test Suites: 26 passed, 26 total; Tests: 407 passed, 407 total` (coverage thresholds met). The act() warnings in the output come from the pre-existing `Toast` and `CCNNonMatchForm` suites; my suites produce none (`grep -c "act("` over `src/components/applicationx src/components/layout` → 0).
- `npm run build` → exit 0; `○ /collaboration` and `ƒ /programs/[id]/collaboration` appear in the route table.
- `npm run lint` → exit 0, **0 errors, 83 warnings**. The only warning in a touched file is `PageShell.tsx:8 'useCallback' is defined but never used` — pre-existing import, not introduced by these commits. Zero warnings in the new files.
- `tsc --noEmit`: no errors in the new/edited source files. The repo has pre-existing errors in `__mocks__/api.ts`, `e2e/*.spec.ts` and every test file (jest-dom matcher typings are not wired into tsconfig) — my test files inherit that same `toHaveAttribute` typing gap; jest itself is unaffected.

## Files changed

Task 5: `frontend/src/components/layout/PageShell.tsx`, `frontend/src/app/programs/[id]/page.tsx`, `frontend/src/components/layout/__tests__/PageShell.applicationx.test.tsx` (new).

Task 6 (all new): `frontend/src/components/applicationx/{HostStatePanel,ContextBanner,WorkspaceSelector}.tsx`, `index.ts`, `__tests__/{HostStatePanel,HostStatePanel.a11y,ContextBanner,WorkspaceSelector}.test.tsx`, `frontend/src/app/collaboration/page.tsx`, `frontend/src/app/programs/[id]/collaboration/page.tsx`.

## Deviations from the briefs

1. **Two tokens, not one** (per the dispatch note): `resolveContext({ calricula, applicationx }, body, signal)`; both pages call `getToken()` and `getToken('applicationx')`; a `null` from either yields `session_expired`.
2. **`getToken` read through a ref** in both pages (same technique as `useApplicationXStatus`) because `AuthContext` recreates it every render; the brief's `[id, getToken, resolve]` dependency list would re-run the load on every AuthProvider render. Effects are keyed on `isAuthenticated` (and `id`) instead, so the load also waits for auth to settle rather than firing while `PageShell` is still showing its loading screen.
3. **`/collaboration` `context_id`** is the constant `'collaboration:root'` — the brief only specified `program_id: null, workspace_id: null`, and the broker requires a string.
4. **`WorkspaceSelector` has no `onSelect` prop** — controller resolution 1 removed the list, so there is nothing to select; the button is "Go to Programs".
5. The NotificationBell mock path is `@/components/notifications` (the brief anticipated adjusting this), plus a `@/components/theme` mock the brief did not mention (ThemeToggle throws outside ThemeProvider).
6. `Sidebar` receives `applicationXEnabled` as a prop rather than calling the hook itself, so the hook runs once per PageShell instead of once per sidebar (two sidebars are rendered).
7. Program page: added a `role="alert"` card for a failed `api.getProgram` (the brief's skeleton let the load error go unhandled).

## Self-review

- Completeness: every state and copy line in the Task 6 interface list is covered by a test; nav placement/index, gating on `enabled`, all-status program action, and the six controller resolutions are all implemented.
- Names match the briefs (`HostStatePanel`, `ContextBanner`, `WorkspaceSelector`, `requiresApplicationX`, route paths).
- No `@applicationx/*` import; no personal email; tokens are only held in local variables inside async callbacks — never in state, URLs, storage or logs.
- Styling: `luminous-card`, `luminous-button-primary/secondary`, `text-gold-ink` for small gold text, `text-ink`/`text-ink-soft`/`text-muted` body text; no `dark:` utilities added.
- A11y: `role="alert"` on the two urgent states, `role="status"` on the loading line, `role="region"` with `aria-label` on the banner, section headings via `aria-labelledby`, `aria-hidden` icon, sr-only new-tab hints, no nested `<main>`; axe passes.
- Tests verify real behaviour (rendered copy, hrefs, `type="button"`, callback invocation, absence of leaked data) and produce no act() warnings.

## Concerns

- If the broker returns 404 because the embed is disabled and a user deep-links to a collaboration route, `resolveContext` maps it to `service_unavailable` with "ApplicationX returned an unexpected response." (non-retryable). Accurate but slightly generic; a dedicated "not enabled" panel state would be a later refinement.
- The `/collaboration` page's `context_id` constant (`'collaboration:root'`) should be confirmed against whatever the backend/ApplicationX expects for a program-less resolve.
- `LMI Data` and `Employer & Career Collaboration` share `BriefcaseIcon` in the sidebar (as the brief prescribes); visually adjacent duplicate icons may be worth a different glyph later.

---

## Fix report — review findings (commit `4c18b21`)

### 1. Important — Retry re-sent the old `context_id`
`frontend/src/app/programs/[id]/collaboration/page.tsx`: the former `resolve(program)` callback took the cached program. Replaced with a single `load` callback (`useCallback`, dep `[id]`) that aborts the previous controller, creates one per load, fetches both tokens, `api.setToken` + `api.getProgram(id)`, sets `latestContext = `${p.id}:${p.updated_at}`` and resolves. Mount effect and `HostStatePanel`'s `onRetry` (and the program-load-error card's Retry) all call `load`. Abort/stale-result discipline unchanged: every step checks `ctl.signal.aborted`; `setResolution` only when `latestContext.current === contextId`.

### 2. Minor — sign-out effect fired during auth load
Both pages: `const { loading: authLoading } = useAuth()`; the sign-out effect is `if (user || authLoading) return;` with deps `[user, authLoading]`.

### 3. Minor — disabled-embed deep links hit the broker
Both pages: `embedDisabled = status !== null && !status.enabled` (a `null` status means "not known yet" and still resolves). The load/resolve effect returns early when disabled; the page renders a `luminous-card` `<section aria-labelledby>` (no alert role) headed "Employer & Career Collaboration is not enabled for this college." with `Back to program` → `/programs/{id}` (program page) or `Programs` → `/programs` (landing page). Loading line, selector and `HostStatePanel` are suppressed in that state.

### Covering tests (pages are coverage-excluded but the suites run under `testMatch`)
- `frontend/src/app/programs/[id]/collaboration/__tests__/page.test.tsx` (4): Retry after `context_stale` → `getProgram` called twice and the second `resolveContext` body has `context_id: 'p1:v2'` (first was `'p1:v1'`), then the `ContextBanner` region renders; disabled embed → card + `/programs/p1` link, no alert, `getProgram`/`resolveContext` never called; `user: null, loading: true` → no alert, `role="status"` "Checking workspace access"; `user: null, loading: false` → `session_expired` alert with `/login` link.
- `frontend/src/app/collaboration/__tests__/page.test.tsx` (4): `mapping_required` → `WorkspaceSelector`, body sent with `program_id: null, workspace_id: null`; `access_required` → panel; disabled → card + `/programs` link, broker never called; auth loading → no alert.
- Mocks: `@/contexts/AuthContext`, `@/hooks/useApplicationXStatus`, `@/lib/api`, `@/lib/applicationx/client`, `@/components/layout/PageShell` (passthrough), and a per-file `next/navigation` `useParams` override — no fighting with the global Next mocks was needed.

### Commands and output
```
npx jest src/app/collaboration 'src/app/programs/\[id\]/collaboration' src/components/applicationx src/components/layout --coverage=false
  Test Suites: 7 passed, 7 total   Tests: 27 passed, 27 total   (no act() warnings)
npm test        → Test Suites: 28 passed, 28 total   Tests: 415 passed, 415 total
npm run build   → exit 0
npm run lint    → exit 0, 0 errors, 83 warnings (unchanged; none in the collaboration/applicationx files)
npx tsc --noEmit → no errors in the touched source files (pre-existing test-typing errors unchanged)
```
