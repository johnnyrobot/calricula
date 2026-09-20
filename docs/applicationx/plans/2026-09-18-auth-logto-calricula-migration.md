# Calricula — Migrate Authentication from Firebase to Logto (OIDC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase Authentication in Calricula with Logto (OpenID Connect) so that Calricula and ApplicationX share one identity tenant (ADR-0001), Calricula's API verifies Logto access tokens with JWKS, the `User` record is keyed by a provider-neutral subject, the frontend signs in through `@logto/next`, and the dev/demo modes keep working for local development and the public demo — without breaking the existing role, workflow, and CCN authorization tests.

**Architecture:** Calricula's authentication is concentrated in `backend/app/core/firebase.py` (`verify_firebase_token`, dev-token map, demo mode), `backend/app/core/deps.py` (`get_current_user`, `get_current_user_optional`, auto-provisioning), `backend/app/api/routes/auth.py` (`/api/auth/login|me|logout|check`), the `User.firebase_uid` column, and the frontend `lib/firebase.ts` + `contexts/AuthContext.tsx` + `app/login/page.tsx`. The migration keeps the dependency names and response shapes, swaps the verifier for a JWKS/PyJWT one, renames the identity column with a data-preserving Alembic migration, and moves the browser flow to the Logto SDK with the session in an encrypted HttpOnly cookie. The broker in the host plan then forwards Logto access tokens whose audience is the ApplicationX API resource.

**Tech Stack:** PyJWT 2.14 (`[crypto]`), FastAPI, SQLModel/Alembic (existing); `@logto/next` for Next.js 16.2.9 App Router; Playwright e2e in dev mode.

**Spec:** `ADR-0001-auth-stack-logto.md`; EMBEDDED-INTERFACE §4; host plan `2026-09-17-p1a-calricula-host.md` Task 2 (bearer forwarding). Calricula constraints from `CLAUDE.md`: BSD-3 branding, WCAG 2.2 AA, light-only UI, coverage floor 45 %, no secrets committed, never a real personal email.

## Global Constraints

- `get_current_user`/`get_current_user_optional` keep their signatures and error semantics (401 missing/invalid; auto-provision new users as `FACULTY`); `/api/auth/*` response models are unchanged except that `UserResponse.firebase_uid` becomes `auth_subject` (kept as a deprecated alias for one release: serialize both).
- Token verification: JWKS signature, `iss == OIDC_ISSUER`, `aud` includes `OIDC_AUDIENCE` (Calricula's own API resource) **and** the frontend must request a token whose audience also covers the ApplicationX resource when calling the broker (host plan) — see Task 5.
- `AUTH_DEV_MODE` keeps the existing `dev-*` map (seven tokens incl. `dev-demo-001`) and remains refused in production; `DEMO_MODE` keeps "only users whose email contains `demo`" but reads the email from the Logto ID-token claims exchanged at `/api/auth/login` (access tokens carry no email) — see Task 2.
- Identity data: `users.firebase_uid` → `users.auth_subject` (unique, indexed) plus `users.auth_issuer` (nullable; **NULL for existing rows** — they carry Firebase UIDs, and NULL is the predicate the one-time re-link uses; *amended after execution: the original text said "default the configured issuer", which would have stamped Firebase rows with the Logto issuer and made the re-link impossible*), with the values preserved (Firebase UIDs remain valid subjects until users re-authenticate; a one-time re-linking step matches by verified email on first Logto login — Task 2).
- No personal email anywhere (test users keep `@calricula.com` seed emails). Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as its own paragraph. Branch off `main`; PR with the required attribution line.

## File Structure

```
backend/app/core/oidc.py                 # verify_access_token, verify_id_token (login), JWKS client; dev map moves here
backend/app/core/firebase.py             # deleted
backend/app/core/deps.py                 # uses oidc; looks up User by (auth_issuer, auth_subject)
backend/app/models/user.py               # auth_subject, auth_issuer; firebase_uid removed
backend/app/schemas/auth.py              # auth_subject (+ deprecated firebase_uid alias)
backend/app/api/routes/auth.py           # /login verifies the ID token (email, name) and links/provisions
backend/alembic/versions/<ts>_auth_subject.py   # rename + add column, data-preserving
backend/tests/conftest.py                # mock_oidc_auth replaces mock_firebase_auth; seed users use auth_subject
frontend/src/lib/logto.ts, app/callback/route.ts, app/api/auth/{token,session}/route.ts, app/sign-in/route.ts, app/sign-out/route.ts
frontend/src/lib/firebase.ts             # deleted
frontend/src/contexts/AuthContext.tsx    # Logto session + in-memory access token; dev picker unchanged
frontend/src/app/login/page.tsx          # "Sign in with your college account" → /sign-in; dev picker in dev mode
frontend/src/hooks/useUserCourses.ts     # getToken from AuthContext instead of lib/firebase
.env.example, CLAUDE.md, README/docs      # Logto variables replace Firebase ones
```

---

### Task 1: Backend OIDC verifier and settings (no schema change)

**Files:** Create `backend/app/core/oidc.py`, `backend/tests/test_oidc.py`; modify `backend/app/core/config.py`, `backend/requirements.txt`; delete `backend/app/core/firebase.py` after Task 2 switches callers.

**Interfaces:** Settings `OIDC_ISSUER`, `OIDC_AUDIENCE` (Calricula API resource indicator), `OIDC_JWKS_URL` (default `issuer + "/jwks"`), `OIDC_CLIENT_ID` (the Calricula web app id — the ID token's `aud`), `OIDC_ALGORITHMS=["ES384","RS256"]`; remove `FIREBASE_PROJECT_ID`/`FIREBASE_SERVICE_ACCOUNT_PATH`. `_production_safety` (existing validator around `config.py:95-110`) requires `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID` in production and keeps refusing `AUTH_DEV_MODE`/`DEMO_MODE`.
`oidc.verify_access_token(token) -> dict` (audience = API resource) and `oidc.verify_id_token(token) -> dict` (audience = client id; used only by `/api/auth/login` to read `email`/`name`); `oidc.resolve_dev_token(token) -> dict | None` carrying the seven-entry dev map from `firebase.py:66-74` unchanged (`uid` → `sub`, keep `email`); `oidc.signing_key_for(token)` for tests to monkeypatch. Same status semantics as the ApplicationX verifier (401 invalid, 503 unconfigured/JWKS down); dev tokens accepted only when `AUTH_DEV_MODE`; when the provider is unconfigured and `AUTH_DEV_MODE` is off → 503 (preserves `firebase.py:118-127`'s fail-closed rule).

- [ ] Tests first (mirror the ApplicationX `test_oidc.py`: valid access token, wrong aud/iss/exp, disallowed alg, unconfigured 503, JWKS 503, dev token only in dev mode, ID token audience = client id).
- [ ] Implement; `pip uninstall firebase-admin`; `PyJWT[crypto]==2.14.0`; drop the `httpx` pin comment that references firebase-admin (`requirements.txt:33`).
- [ ] Commit `feat(auth): OIDC access/ID token verification via JWKS (Logto), keep dev map`.

### Task 2: Identity column, dependencies, login route, test doubles

**Files:** modify `backend/app/models/user.py` (`firebase_uid: str = Field(unique=True, index=True)` at line 42 → `auth_subject: str = Field(unique=True, index=True)`, `auth_issuer: str | None = Field(default=None, index=True)`; `UserCreate`/`UserRead` at lines 52/58), `backend/app/schemas/auth.py` (lines 28, 43, 78), `backend/app/core/deps.py` (`get_current_user` lines 25-91: verify access token → `sub`; lookup `User.auth_subject == sub`; auto-provision with the placeholder `{sub}@oidc.invalid` (`users.email` is NOT NULL; *amended after execution: the original text said `email=None`*) — the verified ID-token email replaces it at `/login`), `backend/app/api/routes/auth.py` (`/login` lines 99-170: accept the **ID token** in the Authorization header for this route only, verify with `verify_id_token`, link an existing user by `auth_subject` or, once, by verified email match to a legacy row whose `auth_issuer` is null, else provision; return the profile), new Alembic migration, `backend/tests/conftest.py` (`mock_firebase_auth` at 340-346 → `mock_oidc_auth` patching `app.core.deps.verify_access_token`; seed users at 96/112/128/144 use `auth_subject=f"test_..."`), every test referencing `firebase_uid` (`test_auth_characterization.py`, `test_api_integration.py`, `test_security_regressions.py`, `test_courses_crud.py`, `test_ccn_api_integration.py`, `test_ccn_auth.py`, `test_workflow_endpoints.py`).

- [ ] Migration: `op.alter_column("users", "firebase_uid", new_column_name="auth_subject")`, add `auth_issuer` nullable + index; downgrade reverses; `alembic upgrade head` + `check` clean against the dev DB (`:5433`).
- [ ] The seed (`seeds/seed_all.py` and any fixture writing `firebase_uid`) uses `auth_subject` with the same `test_*` values so `dev-*` tokens still resolve.
- [ ] Demo mode: `verify_id_token` claims must contain `email` with `demo`; keep the 403 message.
- [ ] Run the full backend suite; coverage ≥ 45 %.
- [ ] Commit `feat(auth): key users by OIDC subject; login via ID token; migrate firebase_uid`.

### Task 3: Frontend sign-in with `@logto/next`

**Files:** create `frontend/src/lib/logto.ts`, `frontend/src/app/callback/route.ts`, `frontend/src/app/api/auth/{token,session}/route.ts`, `frontend/src/app/sign-in/route.ts`, `frontend/src/app/sign-out/route.ts`; modify `frontend/src/contexts/AuthContext.tsx` (replace the Firebase branch at lines 300-360: on mount fetch `/api/auth/session`; `getToken()` returns the in-memory access token from `/api/auth/token`, refreshed before expiry; `signIn(email, password)` is removed — the login page redirects to `/sign-in`; keep the dev-mode identity picker and `NEXT_PUBLIC_AUTH_DEV_MODE` semantics at lines 40-63), `frontend/src/app/login/page.tsx` (replace the email/password form with a "Sign in" button to `/sign-in`, keep the dev picker; remove the Firebase error-code mapping at 56-57), `frontend/src/hooks/useUserCourses.ts:13` (use `useAuth().getToken`), `frontend/src/lib/api.ts` (unchanged interface: `setToken`), `frontend/package.json` (`-firebase`, `+@logto/next`), `frontend/src/contexts/__tests__/AuthContext.test.tsx` (mock `fetch` for the two routes instead of Firebase), e2e specs that mention dev mode keep working unchanged.
- The `/login` API call after sign-in sends the **ID token** obtained via `getIdToken(logtoConfig)`/`getLogtoContext` on the server route `/api/auth/session` (which can perform the `/api/auth/login` exchange server-side and return the profile), so the browser never handles the ID token.
- [ ] `npm run build`, `npm run lint`, `npm test` (jest coverage gate), Playwright dev-mode suites green.
- [ ] Commit `feat(auth): Logto sign-in via @logto/next; remove Firebase web SDK`.

### Task 4: Environment, docs and demo

**Files:** `.env.example` (lines 55-70 Firebase block → `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`; frontend `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_COOKIE_SECRET`, `LOGTO_BASE_URL`, `LOGTO_API_RESOURCE`, `LOGTO_APPLICATIONX_RESOURCE`), `CLAUDE.md` (line 3 stack sentence and line 53 secrets note), `docker-compose*.yml` env pass-through, `docs/` deployment/demo guides that mention Firebase (`grep -rn -i firebase docs README.md`), `serviceAccountKey.json` placeholder removed from the repo root and `.gitignore` comment updated.
- [ ] Demo deployment note: `DEMO_MODE` now requires a Logto tenant whose demo users have `demo` in their email; document the tenant setup (web app, two API resources, redirect URIs for `:3001` and the demo host).
- [ ] Commit `docs: Logto replaces Firebase in setup, env and demo guides`.

### Task 5: Broker audience for the embedded workspace (host-plan hook)

**Files:** `frontend/src/lib/logto.ts` (`resources: [LOGTO_API_RESOURCE, LOGTO_APPLICATIONX_RESOURCE]`), `frontend/src/app/api/auth/token/route.ts` (accepts `?resource=` limited to the two configured indicators and returns a token for that resource), the host plan's `createBrokeredAdapter` (Task 7 there) reads `getToken('applicationx')`; backend broker (host plan Task 2) forwards that token unchanged and ApplicationX verifies `aud == OIDC_AUDIENCE` of the ApplicationX API.
- [ ] Test: the token route refuses unknown resources (400) and never returns a token for the ApplicationX resource to a signed-out session.
- [ ] Commit `feat(auth): per-resource access tokens for the ApplicationX broker`.

### Task 6: Exit verification

- [ ] `git grep -i firebase` in code/configs/tests is empty; only docs history may mention it.
- [ ] Backend suite, frontend jest + build + lint, Playwright dev-mode suites, `alembic check` all green; CI workflow updated only if env names changed.
- [ ] Update `docs/applicationx/plans/2026-09-17-p1a-calricula-host.md` Task 1 settings/test fixture (`firebase_uid` → `auth_subject`) and the stub upstream's bearer expectations.

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| ADR-0001 single tenant, JWKS verification, no vendor SDK | 1, 2 |
| Provider-neutral identity key with data preservation | 2 |
| Dev/demo modes preserved and fail-closed in production | 1, 2, 4 |
| Browser never persists tokens; HttpOnly session | 3 |
| Embedded bearer forwarding with ApplicationX audience (EMBEDDED-INTERFACE §4) | 5 |

## Open owner decisions

1. Logto hosting for Calricula's public demo (Cloud free tier vs self-hosted) and the demo users' email convention.
2. Whether legacy Firebase users are re-linked by verified email on first Logto login (default: yes, one-time, logged without content) or must be re-created.
3. Redirect URIs and cookie domain for coordinated sign-in between the Calricula host and the standalone ApplicationX origin.
