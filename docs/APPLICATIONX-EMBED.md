# ApplicationX embed (optional companion)

ApplicationX is a separate companion application for employer and career
collaboration. When a deployment of it exists for your college, Calricula can
show its staff workspace inside Calricula's own layout under
**Employer & Career Collaboration** (global navigation) and a **Collaboration**
action on each program page. Students and employers keep using ApplicationX's
own entry point; Calricula only hosts the staff view.

The embed is off by default. Nothing in this document is required to run
Calricula.

## How it works

- The browser never talks to ApplicationX directly. Calricula's backend exposes
  a small broker under `/api/applicationx/*` that forwards an allowlisted set of
  operations to `APPLICATIONX_API_ORIGIN` over HTTPS.
- `GET /api/applicationx/status` tells the frontend whether the embed is
  enabled; the navigation entry and the program action appear only when it is.
- A program's workspace context is resolved server-side from the program's id
  and `updated_at` (the "revision"); the browser cannot supply program metadata.
- ApplicationX decides access on its own. A Calricula login does not grant
  ApplicationX access; users without it see an "access required" panel and no
  workspace data.
- If ApplicationX is down or misconfigured the collaboration page shows an
  "unavailable" panel with a link back to the program. Curriculum editing is
  never affected.

## Environment variables

All backend settings live in `backend/app/core/config.py` (`APPLICATIONX_*`).
Copy the block from `.env.example`:

| Variable | Required when enabled | Meaning |
| --- | --- | --- |
| `APPLICATIONX_EMBED_ENABLED` | yes | `true` turns the embed on. |
| `APPLICATIONX_API_ORIGIN` | yes | Origin of the ApplicationX API, no path (e.g. `https://ax.example.edu`). In production this must be `https://`; the backend refuses to start otherwise. |
| `APPLICATIONX_ORGANIZATION_REF` | yes | ApplicationX organization slug for this deployment (e.g. `lamc`). |
| `APPLICATIONX_CAMPUS_REF` | yes | Campus code sent with every context (e.g. `LAMC`). |
| `APPLICATIONX_STANDALONE_URL` | no | Public URL of standalone ApplicationX, offered as an "Open in ApplicationX" link. |
| `APPLICATIONX_SERVICE_TOKEN` | no | Optional transport credential sent as `X-Calricula-Service`. It identifies the Calricula deployment; it never expands a user's scope. |
| `APPLICATIONX_TIMEOUT_SECONDS` | no | Upstream timeout (default 20). |

The embed is considered ready only when the first four are set. With
`APPLICATIONX_EMBED_ENABLED=true` but an incomplete configuration, `/status`
reports `enabled: false` and the entry stays hidden.

Frontend (Logto mode) additionally needs `LOGTO_APPLICATIONX_RESOURCE`: the
Logto API resource indicator of the ApplicationX API. The frontend requests an
access token for that resource on demand; see `docs/AUTH-LOGTO.md`.

## Two-token contract

Every broker call carries two bearer tokens:

| Header | Token | Used by |
| --- | --- | --- |
| `Authorization: Bearer …` | The Calricula session token | Calricula's backend, to authenticate the caller. **Never forwarded upstream.** |
| `X-ApplicationX-Token: …` | The user's ApplicationX access token (Logto, audience `LOGTO_APPLICATIONX_RESOURCE`) | Forwarded to ApplicationX as its `Authorization` bearer. |

The broker forwards only the second token, plus `X-Calricula-Host: calricula`
and the optional service token. No cookies or other request headers cross the
boundary. Upstream 4xx bodies are replaced with generic messages unless they
carry a typed host `state`; upstream 5xx and network failures become 502/504
with a stable `code` (`upstream_unavailable`, `upstream_timeout`, …).

In dev mode (`AUTH_DEV_MODE=true` and `NEXT_PUBLIC_AUTH_DEV_MODE=true`) there is
no separate ApplicationX identity: both headers carry the same documented
`dev-*` token (for example `dev-faculty-001`).

## Allowlisted operations

The broker exposes exactly these upstream routes; anything else is 404.

| Broker route | Upstream | Notes |
| --- | --- | --- |
| `POST /api/applicationx/host-contexts/resolve` | `POST /v1/host-contexts/resolve` | Body: `program_id`, `workspace_id`, `context_id`. The program reference (id, title, status, revision) is built server-side. |
| `POST /api/applicationx/ops/chat.messages` | `POST /v1/chat/messages` | Request bodies are capped at 16 KiB. |
| `POST /api/applicationx/ops/chat.cancel` | `POST /v1/chat/runs/{run_id}/cancel` | `run_id` must be a UUID. |
| `POST /api/applicationx/ops/sources.list` | `GET /v1/sources` | |
| `POST /api/applicationx/ops/sources.health` | `GET /v1/sources/{source_id}/health` | `source_id` must match `[a-z_]{2,40}`. |
| `GET /api/applicationx/runs/{run_id}/events` | `GET /v1/chat/runs/{run_id}/events` | Server-Sent Events pass-through; `Last-Event-ID` is honored for resume and a keepalive comment is emitted every 15 s. |

Host states the resolve call can return: `ready`, `access_required`,
`mapping_required`, `context_stale`, `session_expired`, `service_unavailable`,
`version_mismatch`.

## Local development with the stub upstream

`backend/tests/stubs/applicationx_stub.py` is a small FastAPI app that stands in
for ApplicationX. It answers the routes above, streams three chat events
(status, answer with one citation, done) and honors `Last-Event-ID`.

```bash
# 1. Find the program you want to treat as "mapped"
#    (psql) SELECT id FROM programs WHERE title = 'Computer Science';

# 2. Start the stub (from backend/, in the venv)
STUB_MAPPED=<that uuid> uvicorn tests.stubs.applicationx_stub:app --port 8099

# 3. Start the backend pointed at it
AUTH_DEV_MODE=true APPLICATIONX_EMBED_ENABLED=true \
APPLICATIONX_API_ORIGIN=http://localhost:8099 \
APPLICATIONX_ORGANIZATION_REF=lamc APPLICATIONX_CAMPUS_REF=LAMC \
APPLICATIONX_STANDALONE_URL=http://localhost:3002 \
uvicorn app.main:app --port 8001

# 4. Start the frontend in dev-auth mode
NEXT_PUBLIC_AUTH_DEV_MODE=true NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev
```

Stub behaviour:

- Programs listed in `STUB_MAPPED` (comma-separated uuids) resolve to `ready`;
  every other program resolves to `mapping_required`.
- The bearer `dev-articulation-001` (dev token of `articulation@calricula.com`)
  resolves to `access_required`.
- `STUB_DOWN=1` makes every route answer 503, which the broker turns into
  `service_unavailable` (the outage case).

The Playwright spec `frontend/e2e/applicationx-embed.spec.ts` runs against this
stack (`PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test
e2e/applicationx-embed.spec.ts`); rerun it with `STUB_DOWN=1` after restarting
the stub with `STUB_DOWN=1` for the outage case.

## Chat shell

The collaboration routes currently render the workspace context banner and the
host-state panels. The chat shell itself arrives with the shared ApplicationX
workspace package; until that package is a dependency, a `ready` context shows a
placeholder card ("Workspace ready. Chat arrives with the shared package.").
