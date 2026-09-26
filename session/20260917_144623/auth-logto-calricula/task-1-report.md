# Task 1 report: Backend OIDC verifier and settings

## What was implemented

- `backend/app/core/oidc.py` (new): provider-neutral OIDC verifier for Logto, modelled on (not imported from) the ApplicationX verifier at `applicationx/backend/app/identity/oidc.py`.
  - `AuthError(status, detail)` — plain exception, not `HTTPException`; Task 2's `get_current_user` will map it.
  - `_issuer()` — `OIDC_ISSUER` normalised with `rstrip("/")`.
  - `_jwks_url()` — raises `AuthError(503, "authentication not configured")` when `OIDC_ISSUER`/`OIDC_AUDIENCE` are unset; else `OIDC_JWKS_URL` or `issuer + "/jwks"`.
  - `signing_key_for(token)` — `jwt.PyJWKClient(url, cache_keys=False, lifespan=600, timeout=5)`, cached per URL under a module-level lock. `cache_keys=False` is load-bearing: PyJWT's per-key cache never expires, which would keep trusting a rotated-out key.
  - `verify_access_token(token)` — audience `OIDC_AUDIENCE`; `verify_id_token(token)` — audience `OIDC_CLIENT_ID`. Both go through a shared `_verify(token, audience)`: `algorithms=settings.OIDC_ALGORITHMS`, `issuer=_issuer()`, `leeway=60`, `options={"require": ["exp","iat","sub","iss","aud"]}`.
  - Exception mapping (checked in this order): `PyJWKClientConnectionError` → 503; `PyJWKSetError` → 503 (checked before the generic `PyJWTError` handler, since it is itself a `PyJWTError` subclass); `(ValueError, KeyError, TypeError)` from key lookup → 503; any other `PyJWTError` from key lookup or decode → 401; any other exception around decode → 401. All detail strings are constants; the token is never interpolated into them.
  - `resolve_dev_token(token)` — seven-entry dev map copied from `firebase.py`'s `dev_user_map` (`uid` → `sub`), returns `{"sub", "email", "email_verified": True}` only when `settings.AUTH_DEV_MODE` is on; `None` for unknown tokens or when dev mode is off (never treats a dev-shaped token as a dev identity with dev mode off).
  - `verify_bearer(token)` — `resolve_dev_token(token)` first, else `verify_access_token(token)`. Fails closed: unconfigured provider + dev mode off → 503; dev-shaped token + dev mode off + provider configured → falls through to `verify_access_token`, which fails signature/format parsing → 401.
- `backend/app/core/config.py`: added `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`, `OIDC_JWKS_URL` (all `Optional[str] = None`), `OIDC_ALGORITHMS: List[str] = ["ES384", "RS256"]`. Extended `_enforce_production_safety` to additionally require `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID` in production (existing `AUTH_DEV_MODE`/`DEMO_MODE`/`ALLOWED_HOSTS` refusals unchanged).
- `backend/requirements.txt`: added `PyJWT[crypto]==2.14.0` under the Authentication section; annotated `firebase-admin==7.4.0` as removed in Task 2. `firebase-admin`, `python-jose`, and the `httpx` pin comment were left untouched per the sequencing ruling (Task 2 removes Firebase).
- `.env.example`: added an `OIDC (LOGTO) -- replaces Firebase, ADR-0001` block next to the Firebase block with `OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_CLIENT_ID` and one-line comments (Firebase block left in place; Task 4 removes it per the brief).
- `backend/tests/test_oidc.py` (new, 23 tests, no DB dependency): valid access token; wrong aud/iss/expired → 401 (parametrized); disallowed algorithm → 401; ID token verified against `OIDC_CLIENT_ID` and rejected as an access token (and vice versa) → 401; ID token unconfigured client id → 503; unconfigured issuer → 503; JWKS connection error → 503; malformed JWKS body (`ValueError`) → 503; error detail never echoes the token; issuer trailing-slash normalisation; `resolve_dev_token` on/off/unknown-token cases; `verify_bearer` unconfigured+dev-off → 503, dev-shaped+dev-off+configured → 401, dev-on accepts dev token, real token accepted; a real-`PyJWKClient` exercise (stubbed `fetch_data`, reset `oidc._client`/`_client_url`) for an unusable key set (`{"keys": "x"}`) → 503 and for key rotation → 401 after the Tier-1 JWK-set cache is forced to refresh.
- `backend/tests/test_ws4_backend_hygiene.py`: updated `test_production_allows_flags_off` and `test_production_allows_real_allowed_hosts` to also pass the three new required OIDC settings (they broke when the production-safety validator was extended); added `test_production_rejects_missing_oidc_settings`, `test_production_rejects_partial_oidc_settings`, `test_development_allows_missing_oidc_settings` to lock the new guard behavior.

## Tests (TDD evidence)

1. Wrote `backend/tests/test_oidc.py` against the not-yet-created module and ran it first:
   ```
   ImportError while importing test module '.../tests/test_oidc.py'.
   E   ImportError: cannot import name 'oidc' from 'app.core' (.../app/core/__init__.py)
   ```
2. Implemented `app/core/oidc.py`, `config.py`, `requirements.txt`, `.env.example`. Targeted run:
   ```
   tests/test_oidc.py .......................  [100%]
   23 passed, 1 warning in 0.11s
   ```
   (The one warning is the pre-existing `starlette.testclient`/`httpx` deprecation warning, also present before this change — not new.)
3. Full suite surfaced two regressions from extending `_enforce_production_safety` (the two `test_production_allows_*` happy-path tests didn't supply the new required OIDC settings) — fixed by updating those two tests and adding three new ones for the guard itself.

## Full-suite result

```
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider
...
Required test coverage of 45% reached. Total coverage: 50.77%
FAILED tests/test_security_regressions.py::test_protected_endpoint_rejects_forged_token
1 failed, 261 passed, 1 warning in 2.81s
```

`app/core/oidc.py` itself: 64 statements, 97% covered (2 missed lines are the generic `except Exception` fallback around `jwt.decode`, exercised only by truly unexpected errors).

The one failure, `test_protected_endpoint_rejects_forged_token`, is **pre-existing and unrelated to this task**: verified via `git stash` that it fails identically (200 instead of 401/403/503) on the pre-task commit, because the repo-root `.env` has `AUTH_DEV_MODE=true` and an unconfigured Firebase, which makes `firebase.py`'s dev fallback authenticate *any* token as `test_faculty_001` (its "default dev fallback for any dev token" branch, `firebase.py:139-145`). This task did not touch `firebase.py` or that behavior; the brief explicitly scopes this test to "just do not break it further," and it behaves identically to before. Task 2 (switching `get_current_user` to `oidc.verify_bearer`) is expected to fix it for real, since `oidc.py` has no such blanket dev fallback — `resolve_dev_token` only matches the seven documented `dev-*` strings.

No new warnings were introduced (pytest's warning count is unchanged at 1, same warning as before this task).

## Trailer verification

```
$ git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'
Claude Fable 5.1 <noreply@anthropic.com>
```

## Files changed

- `backend/app/core/oidc.py` (new)
- `backend/tests/test_oidc.py` (new)
- `backend/app/core/config.py`
- `backend/requirements.txt`
- `.env.example`
- `backend/tests/test_ws4_backend_hygiene.py`

Commit: `62b3e5e` — `feat(auth): OIDC access/ID token verification via JWKS (Logto), keep dev map`

## Self-review

- Matched the brief's function/constant names exactly (`AuthError`, `_issuer`, `_jwks_url`, `signing_key_for`, `verify_access_token`, `verify_id_token`, `resolve_dev_token`, `verify_bearer`) so Task 2 can wire them in without renaming.
- Confirmed `PyJWKSetError` is caught before the generic `PyJWTError` handler (it's a subclass) — verified by the `test_unusable_jwks_key_set_is_503_not_401`-equivalent test passing with a real `PyJWKClient` and stubbed `fetch_data`.
- Confirmed `cache_keys=False` is actually load-bearing by writing the key-rotation test with a real `PyJWKClient` (not just the stubbed `signing_key_for` used elsewhere) and forcing the Tier-1 cache to expire via `jwk_set_cache.jwk_set_with_timestamp = None`, matching the ApplicationX test's technique.
- Verified `_jwks_url()` gates on `OIDC_ISSUER`/`OIDC_AUDIENCE` only (not `OIDC_CLIENT_ID`), per the brief's literal wording; `verify_id_token`'s own `if not audience` check in `_verify` separately covers an unset `OIDC_CLIENT_ID`. Both configurations are exercised by tests (`test_unconfigured_is_503` vs `test_id_token_unconfigured_client_id_is_503`).
- Did not touch `firebase.py`, `deps.py`, or remove `firebase-admin`/`FIREBASE_*` — confirmed by the ruling to defer that to Task 2, and confirmed no caller imports `app.core.oidc` yet (it is inert until Task 2 wires it up).
- Ran the full test file diff to confirm only `test_oidc.py` (new) and `test_ws4_backend_hygiene.py` (extended, not weakened — old assertions kept, new required fields added) were touched among test files.
- Checked `git log -1` author/trailer and diff stat before reporting.

## Concerns

- `test_protected_endpoint_rejects_forged_token` remains red going into Task 2, for the pre-existing reason above (not introduced by this task). Flagging so Task 2's author doesn't mistake it for a new regression — it should go green once `get_current_user` calls `oidc.verify_bearer` instead of `firebase.verify_firebase_token`, since `oidc.py` has no blanket "any token in dev mode" fallback.
- The dev-token map in `oidc.py` is a hand-copied duplicate of `firebase.py`'s `dev_user_map` (by design, per the brief — `oidc.py` must not import `firebase.py`). It's a small, static, seven-entry table; a mismatch would only affect dev/test auth-bypass behavior, and Task 2 deletes `firebase.py` shortly after, making `oidc.py`'s copy the sole source of truth.
- I updated two pre-existing tests in `test_ws4_backend_hygiene.py` (`test_production_allows_flags_off`, `test_production_allows_real_allowed_hosts`) that would otherwise fail once the production-safety validator required the new OIDC settings — this is an expected consequence of the brief's own instruction to extend `_production_safety`, not scope creep, but noting it since it touches a file outside the brief's explicit file list.
