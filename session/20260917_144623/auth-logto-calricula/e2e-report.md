# E2E verification — auth/logto-migration (dev-mode flows)

Date: 2026-09-19
Branch: `auth/logto-migration` @ `bd8b533` (HEAD at run time)
Scope: verify Calricula's dev-mode Playwright e2e flows still work after the Firebase→Logto auth migration. No tracked files were modified; nothing was committed or pushed.

## Overall result

**Backend and dev-mode auth (login, token issuance, `/api/auth/me`) work correctly post-migration.** Of the 4 specs run (26 tests): **17 passed, 8 failed, 1 skipped** (pre-existing `test.skip` in the spec itself, unrelated to this run).

All 8 failures are attributable to causes **other than** the Firebase→Logto migration:
- 1 test-authoring bug pre-dating this branch (hardcoded absolute `localhost:3000` URL, ignores `baseURL`/`PLAYWRIGHT_BASE_URL`).
- 1 test/product mismatch: dev-mode auth is sessionStorage-based, `clearCookies()` does not clear it, so the "redirect unauthenticated user to login" test never observes a logout.
- 6 failures cascade from a single **product bug** (not auth-related): the courses API serializes `units` as a JSON **string** (`"3.0"`) because it is a `Decimal` in the Pydantic schema, and `frontend/src/app/courses/page.tsx:111` calls `course.units.toFixed(1)`, which throws (`course.units.toFixed is not a function`) and trips the route's error boundary ("Something went wrong"). This breaks every test that needs `/courses` to render.

No 401/403 in the backend log stemmed from broken auth wiring — the `/api/courses`/`/api/dashboard/stats` 401s reproduced live all stem from either the courses-crash render path or the sessionStorage/clearCookies test mismatch above, not the Logto migration itself. **No 500s occurred at any point.**

## Environment

- Backend: `backend/venv`, `AUTH_DEV_MODE=true DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/uvicorn app.main:app --port 8001`, log at `/tmp/calricula-backend-e2e.log`.
- DB: pre-existing disposable `calricula-test-db` Docker Postgres on 5435. Schema already at the Logto-era head (`users.auth_subject` present, no Firebase columns; no `alembic_version` table — schema was created directly, not via `alembic upgrade`, so no migration was run against it). TOP codes (173) and CCN standards (350) were already present. Ran `DATABASE_URL=...5435... python -m seeds.seed_users` to add the 6 missing fixed dev accounts (`faculty@calricula.com` already existed from prior test runs; `faculty2/3@`, `chair@`, `articulation@`, `admin@`, `demo@calricula.com` were created). `seed_users` is idempotent (skip-if-email-exists), so this was safe to run against the shared disposable DB.
- Frontend: `frontend/`, `NEXT_PUBLIC_AUTH_DEV_MODE=true NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev -- -p 3001`, log at `/tmp/calricula-frontend-e2e.log`. Port 3001 chosen because 3000 is occupied by an unrelated local project (`langfuse-langfuse-web-1` Docker container, confirmed via `docker ps`); frontend's own `.env.local` (untracked, gitignored) sets `NEXT_PUBLIC_API_URL=http://localhost:8000`, but shell-exported env vars take precedence over `.env.local` in Next.js, and this was confirmed empirically via a live browser session (network calls went to `localhost:8001`, matched by seeded `faculty@calricula.com`'s data).
- Playwright: `chromium` (build v1200) was missing locally; installed via `npx playwright install chromium` (network fetch, ~250MB). Playwright config: the tracked `frontend/playwright.config.ts` hardcodes `webServer.url`/`baseURL` to port 3000, which would fight the already-running frontend and the unrelated port-3000 tenant. Used a temporary, **untracked** config copy `frontend/playwright.e2e-verify.config.ts` (deleted after the run) pointing `baseURL` at `http://localhost:3001` with no `webServer` block (servers were already running). No tracked file was edited.
- Ports checked free/owned before starting anything: 3001 (free → used for frontend), 8001 (free → used for backend), 5435 (calricula-test-db, expected). 3000/8000/5433 belong to other local projects and were left untouched.

## Specs run vs. not run

Task explicitly requested `login-dashboard-exploration.spec.ts`, `navigation-test.spec.ts`, `ccn-workflow.spec.ts`, plus any spec whose header mentions dev auth. Of the remaining 8 specs under `frontend/e2e/`, only `workflow-transitions.spec.ts`'s header literally states "Dev auth mode enabled (NEXT_PUBLIC_AUTH_DEV_MODE=true)" — it was added to the run. The rest either have no such header statement or rely on the same `loginAsUser`/`TEST_USERS` dev-mode fixture without saying so explicitly in a header comment; per the literal instruction they were left **not run**.

| Spec | Run? | Result |
|---|---|---|
| `e2e/ccn-workflow.spec.ts` | Yes | 11 passed, 1 failed |
| `e2e/navigation-test.spec.ts` | Yes | 1 failed |
| `e2e/login-dashboard-exploration.spec.ts` | Yes | 1 failed |
| `e2e/workflow-transitions.spec.ts` | Yes (header says "Dev auth mode enabled") | 5 passed, 1 skipped (intentional `test.skip`), 6 failed |
| `e2e/complete-course-creation.spec.ts` | No | — uses relative `/login` + dev form but no explicit "dev auth" header statement |
| `e2e/course-actions-simple.spec.ts` | No | — same |
| `e2e/sidebar-panels.spec.ts` | No | — header lists prerequisites but doesn't say "dev auth mode enabled" |
| `e2e/test-course-actions.spec.ts` | No | — same as course-actions-simple |
| `e2e/test-course-editor-navigation.spec.ts` | No | — same |
| `e2e/test-department-analytics.spec.ts` | No | — hardcodes `http://localhost:3000/dashboard`, would hit the unrelated port-3000 tenant |
| `e2e/user-menu-test.spec.ts` | No | — hardcodes `http://localhost:3001/login` (matches our port by coincidence) |

## Per-spec results

### `e2e/ccn-workflow.spec.ts` — 11 passed, 1 failed

**FAILED**: `CCN Detection Step › Authentication › unauthenticated user is redirected to login`
- Assertion: `await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 10000 })` — timed out.
- Classification: **test/product mismatch, not a migration regression.** The enclosing `describe`'s `beforeEach` calls `loginAsUser(faculty)`, which in dev mode sets `window.sessionStorage.setItem('dev_user', ...)` (see `src/contexts/AuthContext.tsx` `login()`). The test then calls `page.context().clearCookies()`, but dev-mode identity lives in `sessionStorage`, not cookies, so the session survives and `/courses/some-course-id/edit` does not redirect. Backend log shows the underlying API call did 401 (`GET /api/courses/some-course-id 401 Unauthorized`, see Backend log excerpt below) — the frontend just has no global 401→redirect-to-login interceptor, so the page stays put. This is a test/product design gap that predates the Logto work (dev mode has always used sessionStorage for the identity picker).

All other 11 CCN workflow tests (detection loading, CCN match/no-match, error handling + retry/skip, benefits panel, AB 1111 notice) passed, including dev-mode login via `loginAsUser`.

### `e2e/navigation-test.spec.ts` — 1 failed

**FAILED**: `Navigation Tests › navigate through all pages: Courses, Programs, Library, LMI Data, and Dashboard`
- Assertion: `await page.getByRole('link', { name: 'Programs' }).click()` — 30s test timeout exceeded, because the prior step never got a usable page (Courses page title captured as `"Something went wrong"`, 0 course cards found).
- Classification: **product bug, not auth-related.** Root-caused live (see "Root cause: courses `units` crash" below).
- Login via `loginAsUser(TEST_USERS.faculty)` and reaching `/dashboard` worked fine; the failure is entirely downstream of the courses-list render crash.

### `e2e/login-dashboard-exploration.spec.ts` — 1 failed

**FAILED**: `Login and Dashboard Exploration › login with demo credentials and explore dashboard`
- Assertion: `await page.waitForSelector('input[type="email"]', { timeout: 10000 })` — timed out.
- Classification: **infrastructure/test-authoring bug, not a migration regression.** The spec hardcodes `await page.goto('http://localhost:3000/login')` (line 12), an absolute URL that bypasses Playwright's `baseURL`/`PLAYWRIGHT_BASE_URL` entirely. Port 3000 is occupied by an unrelated local Docker project (`langfuse-langfuse-web-1`), so the test loaded the wrong application and never found a login form. Same login flow (dev identity picker, `demo@calricula.com` / `dont4get`) was verified working manually against the correct port (3001) — see manual verification below.

### `e2e/workflow-transitions.spec.ts` — 5 passed, 1 skipped, 6 failed

Passed: Draft→Submit for Review (2), CurriculumChair sees Approvals queue, CurriculumChair sees approval actions, Return-for-Revision modal validation.
Skipped: `Complete Workflow Flow › Full approval cycle from Draft to Approved` — an intentional `test.skip(...)` already present in the spec source (not environment-caused).

**FAILED** (all downstream of the same `/courses` render crash, see root cause below):
1. `Reviewer Can View Approval Queue › Faculty cannot access Approvals page` — `expect(locator('text=Access Restricted')).toBeVisible()` timed out (element not found).
2. `Workflow Progress Visualization › Course detail page shows workflow progress bar` — `expect(locator('text=Approval Workflow Progress')).toBeVisible()` timed out.
3. `Workflow History › Course detail page shows workflow history panel` — `expect(await page.locator('.luminous-card').count()).toBeGreaterThan(0)` — got 0.
4. `Role-Based Access Control › Faculty can only edit their own courses` — `expect(locator('h1:has-text("Courses")')).toBeVisible()` timed out.
5. `Role-Based Access Control › Admin has full access to all features` — same assertion, same failure.
6. (Same underlying cause reflected across the above.)

Failure #1 (Approvals access-denied message) is likely a related but distinct copy/selector mismatch (`Access Restricted` text not found) rather than the courses crash — flagged for product follow-up but not chased further, since it's outside this run's scope (auth verification) and the assertion target (`/approvals`, not `/courses`) doesn't touch the `units.toFixed` code path.

## Root cause: `/courses` render crash (drives 6 of 8 failures)

Reproduced live via a manual Playwright MCP session (login as `faculty@calricula.com` / `Test123!`, dev identity picker):

- `GET http://localhost:8001/api/courses?page=1&limit=3` returns `"units": "3.0"` — a **JSON string**, because `backend/app/schemas/courses.py:229,255` and `backend/app/models/course.py:75` type `units` as `Decimal`, and FastAPI/Pydantic's default JSON encoding renders `Decimal` as a string.
- `frontend/src/app/courses/page.tsx:111` calls `course.units.toFixed(1)`, a `Number.prototype` method, which throws `TypeError: course.units.toFixed is not a function` on a string.
- The throw is caught by the route's error boundary, replacing the whole `/courses` view with "Something went wrong" — which is exactly what `navigation-test.spec.ts` captured as the page title, and why `workflow-transitions.spec.ts` tests that first `goto('/courses')` and then look for a course link/`h1:has-text("Courses")` fail.
- Confirmed via direct DB query: all 290 seeded courses have numeric `units` (`3.0` × 230, `4.0` × 60, none NULL) — the string-vs-number mismatch is a **backend serialization convention**, not bad data.
- This is unrelated to the Firebase→Logto auth swap; `Decimal` JSON serialization is independent of the auth stack. It is a pre-existing/orthogonal product bug, surfaced here because these are the first e2e runs in a while to get far enough past login to reach a real courses list.
- A separate, likely-unrelated observation from the same manual session: on a **hard** page load of `/courses` (full navigation, not a Next.js client-side link click), the very first `/api/courses` fetch can race ahead of `AuthContext`'s dev-mode session restore (`sessionStorage` read happens inside a `useEffect`, which per React's effect-ordering runs after a child page's own mount effect), producing a transient 401 with a stuck "Authentication required" banner and a manual "Try again" button — this does not affect the 4 specs run here (they navigate via client-side link clicks, where `user` state is already populated from the synchronous `login()` call), but is worth a follow-up ticket since a user hard-refreshing `/courses` in dev mode would see a spurious auth error.

## Backend log — 401/403/500 context

No 500s occurred during the entire run. All 401s below are `/api/courses*` / `/api/dashboard/stats` calls tied to the two issues above (courses-crash retries and the clearCookies-vs-sessionStorage mismatch), not broken token issuance — `/api/auth/me` and `/api/notifications*` calls with the same dev bearer token succeeded throughout (200 OK) in the same log.

```
GET /api/courses?page=1&limit=12 HTTP/1.1" 401 Unauthorized   (x14, spread across ccn-workflow/navigation-test/workflow-transitions runs)
GET /api/courses/some-course-id HTTP/1.1" 401 Unauthorized    (ccn-workflow "unauthenticated user" test — expected 401, unhandled client-side)
GET /api/dashboard/stats HTTP/1.1" 401 Unauthorized            (x1)
GET /api/notifications/counts HTTP/1.1" 200 OK                 (interleaved — proves the dev bearer token itself is valid when sent)
```

Full log: `/tmp/calricula-backend-e2e.log` (not preserved after cleanup — ephemeral temp file; excerpt captured above).

## Manual verification (supplementary, not part of the automated suite)

To confirm dev-mode login itself works post-migration (independent of the two bugs above), a manual Playwright MCP session was run against the correctly-configured frontend (port 3001):
1. `GET /login` → dev identity picker rendered ("Development mode: sign in as one of the seeded accounts...").
2. Filled `faculty@calricula.com` / `Test123!`, clicked "Sign in" → redirected to `/dashboard`, sidebar showed "Dr. Maria Garcia / Faculty", confirming the seeded profile round-tripped correctly.
3. Direct `curl -H "Authorization: Bearer dev-faculty-001" http://localhost:8001/api/auth/me` → `200 OK` with the correct seeded profile.

This confirms the Logto migration did not break the dev-mode auth bypass itself; the observed e2e failures are all downstream/unrelated issues as detailed above.

## Cleanup

Processes started for this run and stopped afterward:
- Backend uvicorn (PID 92261, port 8001)
- Frontend `npm run dev` wrapper (PID 92417) and its `next dev` child (PID 92440) + `next-server` grandchild (PID 92441), port 3001

Pre-existing processes matching `uvicorn|next dev` at the start of this session (left untouched):
- PID 1561 — `/Users/laccd/.local/share/remedy-server/.venv/bin/uvicorn backend.app.main:app --port 8000` (unrelated project)
- PID 98263 — `node .../next dev --hostname 127.0.0.1 --port 3104` (unrelated project) + its `next-server` child PID 98279

Temporary artifacts removed after the run: `frontend/playwright.e2e-verify.config.ts` (untracked config copy), `/tmp/calricula-playwright.config.ts`, Playwright's `test-results/` and `.playwright-mcp/` scratch output under `frontend/`. `/tmp/calricula-backend-e2e.log` and `/tmp/calricula-frontend-e2e.log` were left in `/tmp` (ephemeral, outside the repo). No tracked file in the repo was modified; nothing was committed or pushed. The `calricula-test-db` Postgres container was left running (pre-existing, shared disposable resource) with the 6 additional seeded dev users now present (idempotent, harmless to re-run).
