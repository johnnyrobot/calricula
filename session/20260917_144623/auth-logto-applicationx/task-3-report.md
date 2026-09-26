# Task 3 report — Docs, compose profile, exit record

## What changed

- `README.md`: added a new "Identity provider (Logto)" section (after "Running P1a", before
  "Database roles") covering: the shared Logto tenant (ADR-0001,
  `docs/applicationx/ADR-0001-auth-stack-logto.md` in the Calricula repo); creating a
  "Traditional web" application with redirect URI `http://localhost:3002/callback` and post
  sign-out URI `http://localhost:3002/`; creating an API resource whose indicator equals
  `OIDC_AUDIENCE`; the backend env (`OIDC_ISSUER=https://<tenant-endpoint>/oidc`, `OIDC_AUDIENCE`,
  optional `OIDC_JWKS_URL`); the frontend env per `frontend/.env.example`; that the dev-token path
  needs no Logto; that production must use https; that Logto's ES384 default signing algorithm is
  accepted by the backend's default `OIDC_ALGORITHMS`; and the optional local Logto service
  (`docker compose exec -T db psql -U postgres -c "CREATE DATABASE logto"` then
  `docker compose --profile auth up -d logto`, admin console `http://localhost:3302`, OIDC
  endpoint `http://localhost:3301`). Also reworded the "No sign-in integration" bullet under
  "What P0 did not do" to drop the word "Firebase".
- `docs/P1A-EXIT.md`: replaced the Firebase owner-decision bullet (shared Firebase project
  id/service account) with the Logto tenant endpoint + API resource indicator, plus the pilot
  hosting choice (self-hosted `svhd/logto` vs. Logto Cloud); replaced the "Firebase sign-in is
  unexercised locally" limitation with "Logto sign-in is unexercised in CI and locally (no tenant
  yet); the dev-token path covers the suites; the OIDC verifier is tested with a locally generated
  ES384 key"; appended a "## Changelog" section with the dated line "2026-09-18: identity provider
  switched to Logto/OIDC (ADR-0001); Firebase removed from code, requirements and configs."
- `docker-compose.yml`: added a `logto` service under `profiles: [auth]` — image
  `svhd/logto:latest`, `depends_on: db: condition: service_healthy`, env `DB_URL`, `ENDPOINT`
  (`http://localhost:3301`), `ADMIN_ENDPOINT` (`http://localhost:3302`), `TRUST_PROXY_HEADER=1`;
  ports `3301:3001`, `3302:3002`; entrypoint `sh -c "npm run cli db seed -- --swe && npm start"`.
  The service was not started.
- `.env.example` (backend): tightened the `OIDC_ISSUER`, `OIDC_AUDIENCE` and `OIDC_JWKS_URL`
  comments — issuer path ends in `/oidc`, audience must equal the Logto API resource indicator,
  JWKS URL is optional/derived.
- `frontend/.env.example`: fixed "All six must be set" → "Five are required (`LOGTO_BASE_URL`
  defaults to `http://localhost:3002`)".

## Grep output (must be empty outside the one dated history line)

```
$ grep -rni firebase --include='*.md' --include='*.example' --include='*.yml' --include='*.yaml' --include='*.toml' . | grep -v node_modules | grep -v '\.venv' | grep -v '\.next'
docs/P1A-EXIT.md:149:- 2026-09-18: identity provider switched to Logto/OIDC (ADR-0001); Firebase
```

Only the dated changelog line remains, as required.

## Compose config outputs

```
$ docker compose config -q && echo OK1
OK1
$ docker compose --profile auth config -q && echo OK2
OK2
```

Both pass; the `logto` service was never started (no image pull).

## Trailer verification

```
$ git show -s --format='%B' HEAD
docs: Logto identity setup; optional dev Logto service

Add the "Identity provider (Logto)" README section (shared tenant per
ADR-0001, console setup, env vars, optional local `docker compose
--profile auth up -d logto`), replace the Firebase owner-decision and
limitation entries in docs/P1A-EXIT.md with their Logto equivalents,
and wire an optional `logto` service into docker-compose.yml under
the `auth` profile.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Trailer is present verbatim, as its own paragraph, and no personal email appears anywhere in the
diff or commit message.

## Files changed

- `/Users/laccd/code/applicationx/README.md`
- `/Users/laccd/code/applicationx/docs/P1A-EXIT.md`
- `/Users/laccd/code/applicationx/docker-compose.yml`
- `/Users/laccd/code/applicationx/.env.example`
- `/Users/laccd/code/applicationx/frontend/.env.example`

Commit: `a3c4ef4` on `main` (not pushed), "docs: Logto identity setup; optional dev Logto service".

## Self-review

- `docs/applicationx/ADR-0001-auth-stack-logto.md` exists in the Calricula repo
  (`/Users/laccd/code/calricula/docs/applicationx/ADR-0001-auth-stack-logto.md`) — the README's
  reference resolves.
- `frontend/.env.example` already documents all five/six Logto vars referenced from the README;
  the README summary is consistent with it.
- Backend `backend/app/core/config.py` confirms `OIDC_ALGORITHMS: list[str] = ["ES384", "RS256"]`
  — the README's ES384 claim is accurate.
- The `docker compose exec -T db psql -U postgres -c "CREATE DATABASE logto"` command mirrors the
  existing role-creation pattern already used in the README's "Running P1a" section (`psql -U
  postgres -d postgres -c ...`), so the syntax is consistent with what's proven to work in this
  repo.
- Both `docker compose config -q` and `docker compose --profile auth config -q` pass after the
  edits (re-verified post-commit).
- No code files were touched (`.env.example`, `frontend/.env.example`, `README.md`,
  `docs/P1A-EXIT.md`, `docker-compose.yml` only), so `npx tsc --noEmit` is unaffected by this
  change; not re-run since nothing under `frontend/src` changed.

## Concerns

- None blocking. Minor note: the README's dev-token AUTH_DEV_MODE flag names
  (`AUTH_DEV_MODE=true` / `NEXT_PUBLIC_AUTH_DEV_MODE=true`) were referenced as already documented
  elsewhere in the README ("Running P1a" section); the new Logto section does not repeat their
  full explanation, only that they make Logto unnecessary, consistent with the brief's scope
  (identity docs, not a re-explanation of the dev-token path).
- The optional local Logto service was deliberately never started (per instructions, to avoid a
  multi-minute image pull) — its runtime behavior (DB seed idempotency, actual sign-in flow) is
  unverified beyond `docker compose config` validation.
