# ApplicationX — Swap Firebase for Logto (OIDC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Firebase from ApplicationX and verify Logto access tokens with standard OIDC (JWKS), keep the `dev-*` token path and every membership/RLS behaviour unchanged, and switch the standalone app's sign-in to `@logto/next`, so ApplicationX is ready to accept the Logto tokens Calricula will forward once its own migration lands.

**Architecture:** Identity verification is provider-neutral below `Principal(issuer, subject)`; only the verifier, four settings, the frontend auth module and docs change. The backend verifies JWTs with PyJWT against the tenant's JWKS (issuer, audience, expiry, algorithm allow-list) and never calls Logto at request time except to fetch/refresh signing keys. The frontend keeps the Logto session in the SDK's encrypted HttpOnly cookie and hands the browser a short-lived access token for the API resource through a same-origin route; the token is held in memory only. No Logto instance is needed for tests, CI or the replay demo (dev tokens).

**Tech Stack:** PyJWT 2.14 (`[crypto]`), FastAPI (existing), `@logto/next` (App Router server actions), Next.js 16.2.9 (existing). Optional dev Logto via `svhd/logto` in compose (profile `auth`, ports 3301/3302).

**Spec:** `ADR-0001-auth-stack-logto.md`; TECHNICAL-SPEC §10 (identity row, updated); EMBEDDED-INTERFACE §4 (updated); P1a plan Task 2 interfaces (`Principal`, `get_principal_from_token`, `authorize_workspace`) which must not change.

## Global Constraints

- `Principal`, `DEV_TOKENS`, `get_principal_from_token(token, session)`, `authorize_workspace`, `org_roles`, `get_principal`/`require_user` keep their names and behaviour; every existing test in `tests/test_identity.py`, `test_host_contexts.py`, `test_isolation.py`, `test_rls.py` passes unchanged except where they reference Firebase settings by name.
- Token verification: signature via JWKS; `iss == OIDC_ISSUER`; `aud` contains `OIDC_AUDIENCE`; `exp` enforced with ≤ 60 s leeway; algorithms limited to `OIDC_ALGORITHMS`; a missing configuration yields 503 "authentication not configured"; any verification failure yields 401 with a content-free message; JWKS fetch failure yields 503. Tokens never appear in logs or error text.
- `AUTH_DEV_MODE` still accepts only the four documented `dev-*` tokens and is refused in production. Production requires `OIDC_ISSUER` and `OIDC_AUDIENCE`.
- Access tokens carry no email/name; `_provision` stores `email=None` for OIDC users (profile sync is a later task). The Logto `sub` is the subject; the issuer URL is the issuer.
- Frontend: no token in localStorage/sessionStorage/URLs; the SDK session cookie is HttpOnly; the dev picker remains behind `NEXT_PUBLIC_AUTH_DEV_MODE=true`; when neither dev mode nor Logto is configured the app is public-only.
- No personal email anywhere. Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as its own paragraph.
- Dev ports stay 5434/8002/3002; the optional Logto service uses 3301 (app) and 3302 (admin console).

## File Structure

```
backend/app/identity/oidc.py            # replaces firebase.py: AuthError, verify_token, JWKS client
backend/app/identity/principal.py       # imports verify_token from oidc; token_revision from iat
backend/app/core/config.py              # OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL, OIDC_ALGORITHMS; guard
backend/requirements.txt                # -firebase-admin, +PyJWT[crypto]==2.14.0
backend/tests/test_oidc.py              # local EC key, JWKS stub, iss/aud/exp/alg/unconfigured cases
frontend/src/lib/logto.ts               # LogtoNextConfig from env (server only)
frontend/src/app/callback/route.ts      # handleSignIn
frontend/src/app/api/auth/token/route.ts# returns { access_token, expires_in } for the API resource, or 204 when signed out
frontend/src/app/api/auth/session/route.ts # { signedIn, name } for the header
frontend/src/lib/auth.tsx               # modes: dev | logto | none; in-memory token refreshed from the token route
frontend/src/app/sign-in/route.ts, sign-out/route.ts  # server actions or route handlers per SDK
docker-compose.yml                      # optional `logto` service (profile auth)
README.md, .env.example, frontend/.env.example, docs/P1A-EXIT.md
```

---

### Task 1: Backend OIDC verifier, settings and production guard

**Files:**
- Create: `backend/app/identity/oidc.py`, `backend/tests/test_oidc.py`
- Modify: `backend/app/identity/principal.py`, `backend/app/core/config.py`, `backend/requirements.txt`, `backend/tests/test_config.py`, `.env.example`
- Delete: `backend/app/identity/firebase.py`

**Interfaces:**
- Settings: `OIDC_ISSUER: str | None = None` (e.g. `https://auth.example.edu/oidc`), `OIDC_AUDIENCE: str | None = None` (the API resource indicator, e.g. `https://api.applicationx.local`), `OIDC_JWKS_URL: str | None = None` (defaults to `f"{OIDC_ISSUER}/jwks"`), `OIDC_ALGORITHMS: list[str] = ["ES384", "RS256"]`. Remove `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_PATH`. Production guard: `OIDC_ISSUER` and `OIDC_AUDIENCE` required.
- `oidc.AuthError(status, detail)` (unchanged shape); `oidc.verify_token(token: str) -> dict` returns the validated claims; `oidc.signing_key_for(token) -> jwt.PyJWK` (module-level `PyJWKClient` cached per JWKS URL with `cache_keys=False` — PyJWT's per-key cache has no expiry, so it would keep trusting rotated-out keys; the JWK-set cache with `lifespan` 600 s is what avoids per-request fetches) — tests monkeypatch this function.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_oidc.py`:
```python
import time, uuid
import jwt, pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from app.core.config import settings
from app.identity import oidc
from app.identity.principal import get_principal_from_token

KEY = ec.generate_private_key(ec.SECP384R1())
KID = "test-key"
ISS, AUD = "https://auth.example.invalid/oidc", "https://api.applicationx.local"

def _tok(**over):
    now = int(time.time())
    claims = {"iss": ISS, "aud": AUD, "sub": "user_" + uuid.uuid4().hex[:8], "iat": now, "exp": now + 300, "scope": "read"}
    claims.update(over)
    return jwt.encode(claims, KEY, algorithm=over.pop("_alg", "ES384"), headers={"kid": KID})

@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", ISS); monkeypatch.setattr(settings, "OIDC_AUDIENCE", AUD)
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", ISS + "/jwks")
    monkeypatch.setattr(oidc, "signing_key_for", lambda token: jwt.PyJWK.from_dict(jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True) | {"kid": KID, "alg": "ES384"}))

def test_valid_token_yields_claims_and_provisions_user(session):
    p = get_principal_from_token(_tok(sub="user_abc"), session)
    assert p.kind == "user" and p.issuer == ISS and p.subject == "user_abc" and p.token_revision is not None
    assert get_principal_from_token(_tok(sub="user_abc"), session).user_id == p.user_id

@pytest.mark.parametrize("over", [{"aud": "https://other"}, {"iss": "https://evil.invalid/oidc"}, {"exp": int(time.time()) - 120}])
def test_wrong_audience_issuer_or_expired_is_401(session, over):
    with pytest.raises(HTTPException) as e: get_principal_from_token(_tok(**over), session)
    assert e.value.status_code == 401 and "token" in e.value.detail.lower()

def test_disallowed_algorithm_is_401(session, monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ALGORITHMS", ["RS256"])
    with pytest.raises(HTTPException) as e: get_principal_from_token(_tok(), session)
    assert e.value.status_code == 401

def test_unconfigured_is_503(session, monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", None)
    with pytest.raises(HTTPException) as e: get_principal_from_token(_tok(), session)
    assert e.value.status_code == 503

def test_jwks_failure_is_503(session, monkeypatch):
    def boom(token): raise jwt.exceptions.PyJWKClientConnectionError("down")
    monkeypatch.setattr(oidc, "signing_key_for", boom)
    with pytest.raises(HTTPException) as e: get_principal_from_token(_tok(), session)
    assert e.value.status_code == 503

def test_error_detail_never_echoes_token(session):
    bad = _tok(aud="x")
    with pytest.raises(HTTPException) as e: get_principal_from_token(bad, session)
    assert bad[:20] not in str(e.value.detail)
```

- [ ] **Step 2: Run to verify failure** — `cd backend && .venv/bin/python -m pytest tests/test_oidc.py -q --no-cov` → `ModuleNotFoundError: app.identity.oidc`

- [ ] **Step 3: Implement**

`backend/app/identity/oidc.py`:
```python
"""Logto / generic OIDC access-token verification (ADR-0001). No provider SDK: JWKS + PyJWT."""
import threading
import jwt
from jwt import PyJWKClient
from app.core.config import settings

class AuthError(Exception):
    def __init__(self, status: int, detail: str): self.status, self.detail = status, detail

_client: PyJWKClient | None = None
_client_url: str | None = None
_lock = threading.Lock()

def _jwks_url() -> str:
    if not settings.OIDC_ISSUER or not settings.OIDC_AUDIENCE:
        raise AuthError(503, "authentication not configured")
    return settings.OIDC_JWKS_URL or f"{settings.OIDC_ISSUER.rstrip('/')}/jwks"

def signing_key_for(token: str) -> jwt.PyJWK:
    """Resolve the signing key for `token` from the tenant JWKS (cached). Tests replace this function."""
    global _client, _client_url
    url = _jwks_url()
    with _lock:
        if _client is None or _client_url != url:
            _client = PyJWKClient(url, cache_keys=False, lifespan=600, timeout=5); _client_url = url
    return _client.get_signing_key_from_jwt(token)

def verify_token(token: str) -> dict:
    url = _jwks_url()  # raises 503 when unconfigured, before touching the token
    try:
        key = signing_key_for(token)
    except jwt.exceptions.PyJWKClientConnectionError as e:
        raise AuthError(503, "authentication temporarily unavailable") from e
    except jwt.exceptions.PyJWTError as e:
        raise AuthError(401, "invalid or expired token") from e
    try:
        return jwt.decode(token, key.key, algorithms=list(settings.OIDC_ALGORITHMS), audience=settings.OIDC_AUDIENCE,
                          issuer=settings.OIDC_ISSUER, leeway=60, options={"require": ["exp", "iat", "sub", "iss", "aud"]})
    except jwt.exceptions.PyJWTError as e:
        raise AuthError(401, "invalid or expired token") from e
```
`principal.py`: import from `app.identity.oidc`; provisioning uses `claims["iss"], claims["sub"], None`; `token_revision=str(claims.get("iat"))`. Keep the three-segment regex gate before verification. `config.py`: settings and guard as above; remove Firebase fields. `requirements.txt`: drop `firebase-admin`, add `PyJWT[crypto]==2.14.0`. `.env.example`: `OIDC_ISSUER=`, `OIDC_AUDIENCE=`, `# OIDC_JWKS_URL=` with a one-line comment each. Update `tests/test_config.py` production cases (replace the Firebase guard case with `OIDC_ISSUER`/`OIDC_AUDIENCE` cases).

- [ ] **Step 4: Run** — `pytest tests/test_oidc.py tests/test_identity.py tests/test_config.py -q --no-cov` → all pass; full suite green, no warnings; `pip show firebase-admin` absent after `pip uninstall -y firebase-admin`.

- [ ] **Step 5: Commit** — `feat(identity): verify Logto/OIDC access tokens via JWKS; drop Firebase` with the trailer.

---

### Task 2: Standalone app sign-in with `@logto/next`

**Files:**
- Create: `frontend/src/lib/logto.ts`, `frontend/src/app/callback/route.ts`, `frontend/src/app/api/auth/token/route.ts`, `frontend/src/app/api/auth/session/route.ts`, `frontend/src/app/sign-in/route.ts`, `frontend/src/app/sign-out/route.ts`, `frontend/src/lib/__tests__/auth.test.tsx` (vitest+jsdom is not set up in the app — use Playwright for behaviour; unit test only the pure token-refresh scheduler if extracted)
- Modify: `frontend/src/lib/auth.tsx`, `frontend/package.json` (`-firebase`, `+@logto/next`), `frontend/.env.example`, `frontend/e2e/workspace.spec.ts` (mode label assertions if any)

**Interfaces:**
- Server env (never `NEXT_PUBLIC_`): `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_COOKIE_SECRET` (≥ 32 chars), `LOGTO_BASE_URL` (`http://localhost:3002` in dev), `LOGTO_API_RESOURCE` (= backend `OIDC_AUDIENCE`). `logto.ts` exports `logtoConfig` built from them and `LOGTO_CONFIGURED: boolean`.
- Routes: `GET /sign-in` → `signIn(logtoConfig)` redirect; `GET /callback` → `handleSignIn(logtoConfig, url)` then redirect `/`; `GET /sign-out` → `signOut(logtoConfig)`; `GET /api/auth/session` → `{ signedIn, name }` from `getLogtoContext`; `GET /api/auth/token` → `{ access_token, expires_in }` from `getAccessToken(logtoConfig, LOGTO_API_RESOURCE)` (204 when signed out). All routes `dynamic = 'force-dynamic'`, `Cache-Control: no-store`. Verify exact export names against the installed `@logto/next` typings (`@logto/next/server-actions`); the docs quick start is the authority if they differ from this plan.
- `auth.tsx`: `mode: 'dev' | 'logto' | 'none'` (`logto` when `NEXT_PUBLIC_LOGTO_ENABLED=true`, a public flag the server sets from `LOGTO_CONFIGURED`); on mount in `logto` mode fetch `/api/auth/session`, then `/api/auth/token`, store the token in a ref, schedule a refresh at `expires_in - 60 s` (cleared on unmount); `getToken()` stays synchronous; `signInLogto()` navigates to `/sign-in`; `signOut()` navigates to `/sign-out`. Dev mode unchanged.
- `SignIn` header control: dev picker, or "Sign in"/"Sign out" links in `logto` mode with the signed-in name.

- [ ] **Step 1: Failing check** — `npm run build` after removing `firebase` fails on the import; e2e still passes in dev mode after the change (regression guard).
- [ ] **Step 2: Implement** as above; `npm uninstall firebase && npm install @logto/next@latest`; lockfile committed.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`, `npm run build`, `npm run lint`; Playwright e2e (dev mode) 3/3 per the README recipe; `grep -ri firebase frontend/src` empty; `grep -rn "localStorage\|sessionStorage" frontend/src` empty.
- [ ] **Step 4: Commit** — `feat(web): Logto sign-in via @logto/next; remove Firebase` with the trailer.

---

### Task 3: Docs, compose profile, exit record

**Files:**
- Modify: `README.md` ("Running P1a" sign-in section; "Database roles" untouched; new "Identity provider (Logto)" section: tenant setup — one web app for the standalone frontend with redirect `http://localhost:3002/callback`, one API resource whose indicator equals `OIDC_AUDIENCE`, scopes none required in P1a), `docs/P1A-EXIT.md` (replace the Firebase owner decision and the "Firebase sign-in unexercised" limitation with the Logto equivalents; add "Logto sign-in unexercised in CI (dev tokens cover the suites)"), `docker-compose.yml` (service `logto` under `profiles: [auth]`: image `svhd/logto`, `DB_URL=postgres://postgres:postgres@db:5432/logto`, `ENDPOINT=http://localhost:3301`, `ADMIN_ENDPOINT=http://localhost:3302`, ports `3301:3001`, `3302:3002`, `depends_on: db: condition: service_healthy`; document `docker compose exec -T db createdb -U postgres logto` before first start), `.env.example`, `frontend/.env.example`.
- Create: none.

- [ ] **Step 1:** Write the docs; `docker compose config -q` and `docker compose --profile auth config -q` both pass; do not start the service in CI.
- [ ] **Step 2:** `grep -rni firebase --include='*.md' --include='*.example' --include='*.yml' .` (outside node_modules/.venv) is empty.
- [ ] **Step 3: Commit** — `docs: Logto identity setup; optional dev Logto service` with the trailer.

---

### Task 4: Exit verification

- [ ] Backend full suite with coverage (≥ 70 %, no warnings); `alembic check` clean (no schema change in this plan).
- [ ] `packages/workspace-ui` untouched (`git diff --stat` shows nothing there).
- [ ] Frontend build + tsc + e2e (dev mode) green; API started with `AUTH_DEV_MODE=true` only — no Logto needed.
- [ ] `git grep -i firebase` returns only historical mentions in `docs/` changelog-style text, if any; none in code, configs or requirements.
- [ ] Append to `docs/P1A-EXIT.md` a dated line: "2026-09-18: identity provider switched to Logto/OIDC (ADR-0001)".

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| ADR-0001 decision (OIDC verification, no vendor SDK) | 1 |
| EMBEDDED-INTERFACE §4 (independent issuer/audience verification; tokens never in logs) | 1 |
| TECHNICAL-SPEC §10 identity row | 1, 3 |
| Standalone sign-in without persisted tokens | 2 |
| Dev/test/CI independence from the provider | 1, 4 |

## Open owner decisions

1. Logto hosting for the pilot: self-hosted (`svhd/logto` on the deployer's Postgres) or Logto Cloud (free tier).
2. Tenant endpoint and API resource indicator values for staging/production (`OIDC_ISSUER`, `OIDC_AUDIENCE`).
3. Whether to require MFA for `org_admin`/`staff` roles at the tenant level.
