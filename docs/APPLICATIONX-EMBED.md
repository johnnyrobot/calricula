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
| `APPLICATIONX_STREAM_MAX_SECONDS` | no | Upper bound on one SSE proxy connection (default 600). When exceeded the broker emits `event: error` with `{"code": "stream_timeout"}` and closes the stream. |
| `LOGTO_APPLICATIONX_RESOURCE` (frontend, Logto mode) | yes | Logto API resource indicator of the ApplicationX API. The frontend requests an access token for that resource on demand (`getToken('applicationx')`); see `docs/AUTH-LOGTO.md`. Not needed in dev auth mode. |

The backend embed is considered ready only when the first four are set. With
`APPLICATIONX_EMBED_ENABLED=true` but an incomplete configuration, `/status`
reports `enabled: false` and the entry stays hidden.

`LOGTO_APPLICATIONX_RESOURCE` is a **frontend** (server-only, Next.js) variable
and is required whenever the embed is enabled and sign-in is through Logto.
Without it the browser cannot obtain an ApplicationX token: the entry is
visible, but every collaboration page reports "ApplicationX is unavailable —
ApplicationX sign-in is not configured for this deployment." rather than an
expired session. Signing in again does not fix that; set the variable.

## Two-token contract

Every broker call carries two bearer tokens:

| Header | Token | Used by |
| --- | --- | --- |
| `Authorization: Bearer …` | The Calricula session token | Calricula's backend, to authenticate the caller. **Never forwarded upstream.** |
| `X-ApplicationX-Token: …` | The user's ApplicationX access token (Logto, audience `LOGTO_APPLICATIONX_RESOURCE`) | Forwarded to ApplicationX as its `Authorization` bearer. |

The broker forwards only the second token, plus `X-Calricula-Host: calricula`
and the optional service token. No cookies or other request headers cross the
boundary. Upstream 4xx bodies are replaced with generic messages unless they
carry a typed host `state`; in that case only `state` (one of the failure
states listed below), `message` (truncated to 500 characters) and `retryable`
are relayed, as `{"detail": {"state", "message", "retryable"}}` with the
upstream status. Upstream 5xx and network failures become 502/504 with a
stable `code` (`upstream_unavailable`, `upstream_timeout`, …).

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
| `GET /api/applicationx/runs/{run_id}/events` | `GET /v1/chat/runs/{run_id}/events` | Server-Sent Events pass-through; `Last-Event-ID` is honored for resume, a keepalive comment is emitted every 15 s, and one connection is capped at `APPLICATIONX_STREAM_MAX_SECONDS`. |

Event ids are **opaque cursors**: the broker forwards `Last-Event-ID` only when
it matches `^[A-Za-z0-9._:-]{1,64}$` and never interprets it (the stub happens
to use decimal integers). `X-Calricula-Service` is sent on every upstream call,
including the SSE stream, when `APPLICATIONX_SERVICE_TOKEN` is set.

Host states the resolve call can return: `ready`, `access_required`,
`mapping_required`, `context_stale`, `session_expired`, `service_unavailable`,
`version_mismatch`. The real ApplicationX returns host failures as `200`
bodies; a typed 4xx is handled as described above. A `state` this build does
not know is shown as `version_mismatch`.

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
e2e/applicationx-embed.spec.ts`), including the chat steps (a question is
answered with one citation through the shell); rerun it with `STUB_DOWN=1`
after restarting the stub with `STUB_DOWN=1` for the outage case.

## Chat shell

A `ready` context on `/programs/<id>/collaboration` renders the shared
ApplicationX workspace shell (`WorkspaceShell` from `@johnnyrobot/workspace-ui`)
inside Calricula's card: a context header, the source-grounded chat (labelled
ask box, transcript, per-answer sources and notices, clarification chips) and,
for non-ready states inside the shell, the package's own host-state view.
Calricula keeps its own `HostStatePanel` for the states it resolves before the
shell mounts, the context banner, the page `<h1>` and the only `<main>`.

The shell's `--ax-*` design tokens are repointed at Calricula's catalog palette
in `frontend/src/styles/globals.css` (light-only; the accent is `gold-ink` so
the primary button label meets WCAG 2.2 AA). The package's re-exported
contracts (`WorkspaceHostAdapter`, `WorkspaceHostContext`, …) and SSE parser
are what `frontend/src/lib/applicationx/` builds on.

Every SSE event payload ApplicationX emits carries the turn's `context_id`;
the shell drops frames tagged with another context (or none), which is why the
stub tags its events too.

## Installing the shared workspace package

`@johnnyrobot/workspace-ui` is published to **GitHub Packages** (private
registry, owner decision 2026-09-19), not to the public npm registry. This
means **building Calricula's frontend from source now needs a GitHub token**,
even for deployments that never enable the embed. `frontend/.npmrc` maps the
`@johnnyrobot` scope to `https://npm.pkg.github.com`; it carries no
credentials, and none must ever be committed.

### Obtain a token

Any GitHub account can create one; it only needs the `read:packages` scope.

- **Classic PAT**: GitHub → Settings → Developer settings → Personal access
  tokens → Tokens (classic) → Generate new token → tick **`read:packages`**
  only. (Fine-grained PATs cannot read GitHub Packages at the time of writing.)
- **GitHub CLI**: `gh auth token` prints the CLI's token, which works when the
  CLI was authorised with the `read:packages` scope
  (`gh auth refresh -s read:packages`).

Treat it like a password: keep it out of `.env`, shell history and images.

### Local development

Put the token in a file npm reads at install time, outside the repository:

```bash
# once: ~/.npmrc (not the repo's frontend/.npmrc)
echo "//npm.pkg.github.com/:_authToken=<token>" >> ~/.npmrc
cd frontend && npm install
```

or hand it to a single command through the environment:

```bash
cd frontend
env "npm_config_//npm.pkg.github.com/:_authToken=$(gh auth token)" npm install
```

### Docker builds

Both `frontend/Dockerfile` (dev) and `frontend/Dockerfile.prod` read the token
as the BuildKit secret **`npm_token`**. It is written to the build user's
`~/.npmrc` only for the duration of the install step and removed in the same
layer, so it never ends up in an image.

```bash
# Plain docker build
printf '%s' "<token>" > /somewhere/npm_token
DOCKER_BUILDKIT=1 docker build --secret id=npm_token,src=/somewhere/npm_token \
  -f frontend/Dockerfile.prod frontend

# docker compose (dev and prod): the secret is wired in both compose files and
# defaults to the gitignored file ./.npm_token at the repository root
printf '%s' "<token>" > .npm_token
docker compose -f docker-compose.prod.yml build frontend
# or point at another file
NPM_TOKEN_FILE=/somewhere/npm_token docker compose build frontend
```

### CI

The frontend job in `.github/workflows/ci.yml` requests `packages: read` and
authenticates with `WORKSPACE_UI_READ_TOKEN` if that repository secret exists,
else with `GITHUB_TOKEN`.

**Required setup step (once, by the package owner).** The package is
published from the `applicationx` repository and inherits that repository's
permissions, so Calricula's own `GITHUB_TOKEN` cannot read it until one of
these is done:

1. In the package's settings on GitHub (Packages → `workspace-ui` →
   Package settings → **Manage Actions access**), add the
   `johnnyrobot/calricula` repository with **read** access; or
2. Create a fine-grained personal access token with the `read:packages`
   permission and store it as the `calricula` repository secret
   **`WORKSPACE_UI_READ_TOKEN`**.

Until one of them is in place the frontend CI job fails at `npm ci` with
`E401`. Pull requests from forks cannot build the frontend either way:
GitHub does not expose repository secrets to fork PRs and the fork's
`GITHUB_TOKEN` has no access to the package.
