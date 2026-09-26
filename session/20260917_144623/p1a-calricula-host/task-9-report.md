# Task 9 report — stub upstream, e2e acceptance spec, env docs, exit checklist

Status: DONE_WITH_CONCERNS
Commit: `8ffd7df` on `feat/applicationx-host`
`test(e2e): ApplicationX embed acceptance cases with a stub upstream; document env`

## What was built

1. `backend/tests/stubs/applicationx_stub.py` (+ `__init__.py`) — FastAPI stand-in for ApplicationX on :8099, FastAPI/uvicorn only.
   - `POST /v1/host-contexts/resolve`: `ready` for `program_ref.external_id` in `STUB_MAPPED`, `mapping_required` otherwise, `access_required` when the bearer is `dev-articulation-001`, 401 when no bearer. All host states are returned with HTTP 200 (see concern 1).
   - `POST /v1/chat/messages` → 202 `{run_id}`; `GET /v1/chat/runs/{id}/events` → SSE ids 1..3 (status, answer with one citation, done), honors `Last-Event-ID`; `POST /v1/chat/runs/{id}/cancel` → 200 JSON (not 204 — the broker parses every reply as JSON and turned a 204 into 502 `upstream_invalid`); `GET /v1/sources`, `GET /v1/sources/{id}/health`.
   - `STUB_DOWN=1` → middleware answers 503 on every route; broker maps it to 502 → frontend `service_unavailable`.
   - Not collected by pytest (`python_files = test_*.py`): 308 collected with and without `--ignore=tests/stubs`.
2. `frontend/e2e/applicationx-embed.spec.ts` — cases 4, 6, 9 in full; cases 1 and 8 up to what exists; the chat steps are two clearly named `test.fixme('chat arrives with the shared workspace package (plan Task 8) — case N chat steps')` blocks. Case 9 is in its own `describe` gated on `STUB_DOWN`; the others are skipped when `STUB_DOWN` is set.
3. `frontend/src/app/programs/[id]/collaboration/page.tsx` — adds a "Back to program" link under `HostStatePanel` for every non-ready host state. Case 9 in the brief clicks that link during the outage and nothing on the page provided it (only `ContextBanner` in the ready state and the embed-disabled card did). Page unit tests still pass (4/4).
4. Docs: `docs/APPLICATIONX-EMBED.md` (tracked deployer doc: what the embed is, `APPLICATIONX_*` table, two-token contract, allowlisted operations, stub recipe, chat-shell note); README "ApplicationX companion (optional)" under Optional Variables pointing at it; `.env.example` block (brief's block verbatim under a short banner). Untracked, not staged: `docs/applicationx/plans/P1A-HOST-EXIT.md` (cases → evidence) and a status paragraph in `docs/applicationx/README.md`. No tracked file links to `docs/applicationx/` (grepped).

## Stack commands (exact)

```
# seed (backend/)
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m seeds.seed_all
# Computer Science = eb4d8cea-46a9-4014-a6f6-0be36671091c (REVIEW); Business Administration Certificate = 78cff451-...

# backend :8001
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula AUTH_DEV_MODE=true APPLICATIONX_EMBED_ENABLED=true \
APPLICATIONX_API_ORIGIN=http://localhost:8099 APPLICATIONX_ORGANIZATION_REF=lamc APPLICATIONX_CAMPUS_REF=LAMC \
APPLICATIONX_STANDALONE_URL=http://localhost:3002 venv/bin/uvicorn app.main:app --port 8001

# stub :8099 (normal / outage)
STUB_MAPPED=eb4d8cea-46a9-4014-a6f6-0be36671091c venv/bin/uvicorn tests.stubs.applicationx_stub:app --port 8099
STUB_DOWN=1 STUB_MAPPED=eb4d8cea-46a9-4014-a6f6-0be36671091c venv/bin/uvicorn tests.stubs.applicationx_stub:app --port 8099

# frontend :3001
NEXT_PUBLIC_AUTH_DEV_MODE=true NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev -- -p 3001

# playwright (temporary untracked config: baseURL 3001, chromium only, no webServer; deleted afterwards)
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test -c playwright.ax-tmp.config.ts e2e/applicationx-embed.spec.ts
STUB_DOWN=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test -c playwright.ax-tmp.config.ts e2e/applicationx-embed.spec.ts
```

## Playwright output

Normal run:
```
  ✓  1 … staff enters from nav and program page without leaving the layout (case 1) (934ms)
  -  2 … chat arrives with the shared workspace package (plan Task 8) — case 1 chat steps
  ✓  3 … unmapped program requires explicit setup (case 4) (693ms)
  ✓  4 … reload and back preserve program context (case 6) (913ms)
  ✓  5 … keyboard-only reach at narrow width (case 8) (1.2s)
  -  6 … chat arrives with the shared workspace package (plan Task 8) — case 8 chat steps
  -  7 … upstream outage leaves curriculum editing usable (case 9)
  3 skipped
  4 passed (4.3s)
```
Outage run (`STUB_DOWN=1`, stub restarted with `STUB_DOWN=1`):
```
  -  1..6 skipped
  ✓  7 … upstream outage leaves curriculum editing usable (case 9) (815ms)
  6 skipped
  1 passed (1.3s)
```
Broker-level checks with curl: status enabled; resolve → ready for Computer Science; articulation token → access_required; chat.messages 202; events stream ids 1,2,3; `Last-Event-ID: 2` → only id 3; chat.cancel 200; sources.list 200.

## Other checks

- `pytest -q -p no:cacheprovider` (DATABASE_URL :5435): 308 passed, coverage 52.59% (gate 45%).
- `npm run lint`: 0 errors, 83 pre-existing warnings; `eslint` on the two changed frontend files: clean (spec is in eslint's ignore pattern like the other e2e files).
- `npm test`: 28 suites / 415 tests passed, thresholds intact.
- `npm run build`: compiled; both collaboration routes emitted.

## Files changed (tracked, in the commit)

`.env.example`, `README.md`, `backend/tests/stubs/__init__.py`, `backend/tests/stubs/applicationx_stub.py`, `docs/APPLICATIONX-EMBED.md`, `frontend/e2e/applicationx-embed.spec.ts`, `frontend/src/app/programs/[id]/collaboration/page.tsx`.
Untracked, written, not staged: `docs/applicationx/plans/P1A-HOST-EXIT.md`, `docs/applicationx/README.md` (one status paragraph).

## Deviations from the brief

- Programs: `Computer Science` (mapped) / `Business Administration Certificate` (unmapped) per the controller; matched by exact card heading, because a program card's accessible name includes its department and `/Computer Science/` first matched the *Web Development Certificate* card ("Computer Science & Information Technology").
- Program is reached through the sidebar link, not `page.goto('/programs')`: a hard load of `/programs` races the restored dev session (first fetch 401 → "Authentication required"; pre-existing, unrelated to the embed). At 390 px the spec opens the mobile menu first.
- Case 9 asserts the *named* alert (`getByRole('alert', { name: /unavailable/i })`) because Next's route announcer is also `role="alert"`; and "Edit Program / Export PDF" is checked as link-or-button (Export PDF is a button).
- Case 8 (trimmed): Tab until "Back to program" inside the region has focus, then Enter navigates back to the program.
- Stub `cancel` returns 200 JSON, not 204 (broker requires JSON). Stub returns host states with HTTP 200 (concern 1).
- `.env.example` block placed after the DEVELOPMENT AUTH BYPASS section (the brief's "after line 114" pointed into the middle of the demo-mode section in the current file).
- Small product change outside "tests/docs": the "Back to program" link on failure states (needed by case 9; AX-21 outage isolation).

## Self-review

- Two-token contract honored by the spec through the real frontend; the stub sees only the forwarded `X-ApplicationX-Token` value as its bearer (verified by the articulation → access_required path).
- Fixme blocks keep the brief's chat steps verbatim so Task 8 can switch them on.
- No `docs/applicationx/` links in tracked files; no real emails; nothing on 3000/8000/5433; no `git stash/reset/checkout` of branches (only `git restore` of two incidental tracked files the dev server/Playwright touched: `frontend/next-env.d.ts`, `frontend/test-results/.last-run.json`).
- Temp Playwright config deleted; `/tmp/ax-e2e-*.log` deleted; `test-results/` artifacts from failed runs removed.

## Concerns

1. Broker/client contract gap (pre-existing, Task 3 vs Task 4): `ApplicationXBroker.forward` passes a typed `state` body through on upstream 4xx, but `client.ts` maps any non-2xx other than 401/502/503/504 to `service_unavailable` — and the route wraps it in `{"detail": …}` anyway. If real ApplicationX returns `access_required` as 403, the UI will say "unavailable" instead of "access required". Either ApplicationX returns host states with 200 (what the stub does) or the client must read `state` from 4xx bodies. Recorded in the exit checklist.
2. `/programs` hard-load race (401 then "Authentication required" with Try again) is a pre-existing product bug that will bite any e2e that `goto('/programs')` after dev login.
3. Not run in Firefox/WebKit (chromium only, per instructions).

## Processes

Backend :8001, stub :8099 and frontend :3001 were all stopped; `lsof` on 3001/8001/8099 shows no listeners. A `next dev` on :3104 that I did not start was left alone.

## Fix report (review: Important — unit coverage for "Back to program" on non-ready states)

Commit `9801432`.

Added to `frontend/src/app/programs/[id]/collaboration/__tests__/page.test.tsx`:
- `non-ready host state: one "Back to program" link under the panel (outage isolation)` — resolves `service_unavailable`, waits for the alert, asserts exactly one link named "Back to program" with `href="/programs/p1"`.
- `ready state: the banner is the only "Back to program" link` — resolves `ready`, asserts exactly one such link, that it lives inside the `Workspace context` region, with `href="/programs/p1"`.

Command: `cd frontend && npx jest "src/app/programs"`
```
  ✓ Retry after context_stale refetches the program and resolves the new context
  ✓ disabled embed: shows the not-enabled card and never calls the broker
  ✓ auth still loading: no session_expired alert is written on first mount
  ✓ signed out after auth settled: session_expired alert
  ✓ non-ready host state: one "Back to program" link under the panel (outage isolation)
  ✓ ready state: the banner is the only "Back to program" link
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```
`npm run lint`: 0 errors (83 pre-existing warnings, none in the changed file).

## Live run after the final fix wave (HEAD 95d9890, 2026-09-19)

Same stack as above (seeded :5435, backend :8001 with APPLICATIONX_* env, stub :8099 STUB_MAPPED=eb4d8cea-46a9-4014-a6f6-0be36671091c, frontend :3001, PLAYWRIGHT_BASE_URL=http://localhost:3001, temp chromium-only config). No code changes.

Normal run:
```
Running 8 tests using 1 worker
  ✓  1 [chromium] › e2e/applicationx-embed.spec.ts:48:7 › ApplicationX embed › staff enters from nav and program page without leaving the layout (case 1) (1.6s)
  -  2 [chromium] › e2e/applicationx-embed.spec.ts:62:8 › ApplicationX embed › chat arrives with the shared workspace package (plan Task 8) — case 1 chat steps
  ✓  3 [chromium] › e2e/applicationx-embed.spec.ts:72:7 › ApplicationX embed › staff without ApplicationX access sees the access panel, never a workspace (case 2) (927ms)
  ✓  4 [chromium] › e2e/applicationx-embed.spec.ts:88:7 › ApplicationX embed › unmapped program requires explicit setup (case 4) (685ms)
  ✓  5 [chromium] › e2e/applicationx-embed.spec.ts:97:7 › ApplicationX embed › reload and back preserve program context (case 6) (916ms)
  ✓  6 [chromium] › e2e/applicationx-embed.spec.ts:109:7 › ApplicationX embed › keyboard-only reach at narrow width (case 8) (1.2s)
  -  7 [chromium] › e2e/applicationx-embed.spec.ts:132:8 › ApplicationX embed › chat arrives with the shared workspace package (plan Task 8) — case 8 chat steps
  -  8 [chromium] › e2e/applicationx-embed.spec.ts:151:7 › ApplicationX embed — upstream outage › upstream outage leaves curriculum editing usable (case 9)
  3 skipped
  5 passed (6.0s)
```

Outage run (stub restarted with STUB_DOWN=1, spec run with STUB_DOWN=1):
```
Running 8 tests using 1 worker
  -  1 [chromium] › e2e/applicationx-embed.spec.ts:48:7 › ApplicationX embed › staff enters from nav and program page without leaving the layout (case 1)
  -  2 [chromium] › e2e/applicationx-embed.spec.ts:62:8 › ApplicationX embed › chat arrives with the shared workspace package (plan Task 8) — case 1 chat steps
  -  3 [chromium] › e2e/applicationx-embed.spec.ts:72:7 › ApplicationX embed › staff without ApplicationX access sees the access panel, never a workspace (case 2)
  -  4 [chromium] › e2e/applicationx-embed.spec.ts:88:7 › ApplicationX embed › unmapped program requires explicit setup (case 4)
  -  5 [chromium] › e2e/applicationx-embed.spec.ts:97:7 › ApplicationX embed › reload and back preserve program context (case 6)
  -  6 [chromium] › e2e/applicationx-embed.spec.ts:109:7 › ApplicationX embed › keyboard-only reach at narrow width (case 8)
  -  7 [chromium] › e2e/applicationx-embed.spec.ts:132:8 › ApplicationX embed › chat arrives with the shared workspace package (plan Task 8) — case 8 chat steps
  ✓  8 [chromium] › e2e/applicationx-embed.spec.ts:151:7 › ApplicationX embed — upstream outage › upstream outage leaves curriculum editing usable (case 9) (835ms)
  7 skipped
  1 passed (1.2s)
```

All started processes stopped; temp config and logs removed.
