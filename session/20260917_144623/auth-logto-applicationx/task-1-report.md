# Task 1 Report: Backend OIDC verifier, settings and production guard

## What was implemented

- **`backend/app/identity/oidc.py`** (new): `AuthError(status, detail)`; `signing_key_for(token)` using a
  module-level `PyJWKClient` cached per JWKS URL (`cache_keys=True`, `lifespan=600`, `timeout=5`, guarded by a
  `threading.Lock`); `verify_token(token) -> dict` which resolves the JWKS URL (raising `AuthError(503, ...)`
  when `OIDC_ISSUER`/`OIDC_AUDIENCE` are unset, before touching the token), fetches the signing key (mapping
  `PyJWKClientConnectionError` → 503, any other `PyJWTError` → 401), then `jwt.decode(...)` with
  `algorithms=settings.OIDC_ALGORITHMS`, `audience=settings.OIDC_AUDIENCE`, `issuer=settings.OIDC_ISSUER`,
  `leeway=60`, requiring `exp/iat/sub/iss/aud` claims, mapping any `PyJWTError` to `AuthError(401, ...)`.
- **`backend/app/identity/firebase.py`**: deleted.
- **`backend/app/identity/principal.py`**: imports `AuthError, verify_token` from `app.identity.oidc` instead of
  `app.identity.firebase`; `token_revision=str(claims.get("iat"))` (was `auth_time`). Three-segment regex gate
  and dev-token path (`DEV_TOKENS`, `AUTH_DEV_MODE`) unchanged.
- **`backend/app/core/config.py`**: removed `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT_PATH`; added
  `OIDC_ISSUER: str | None = None`, `OIDC_AUDIENCE: str | None = None`, `OIDC_JWKS_URL: str | None = None`,
  `OIDC_ALGORITHMS: list[str] = ["ES384", "RS256"]`. Production guard now requires both `OIDC_ISSUER` and
  `OIDC_AUDIENCE` (two separate `raise ValueError` branches, in place of the single Firebase check).
- **`backend/requirements.txt`**: `firebase-admin==7.6.0` → `PyJWT[crypto]==2.14.0`, same line position.
- **`.env.example`**: replaced `FIREBASE_PROJECT_ID=` / `FIREBASE_SERVICE_ACCOUNT_PATH=` with commented
  `OIDC_ISSUER=`, `OIDC_AUDIENCE=`, `# OIDC_JWKS_URL=`, each with a one-line explanatory comment.
- **`backend/tests/test_config.py`**: `PRODUCTION_OK` now sets `OIDC_ISSUER`/`OIDC_AUDIENCE` instead of
  `FIREBASE_PROJECT_ID`; the parametrized missing-guard case `{"FIREBASE_PROJECT_ID": None}` replaced with two
  cases, `{"OIDC_ISSUER": None}` and `{"OIDC_AUDIENCE": None}`.
- **`backend/tests/test_oidc.py`** (new): brief's test file, used verbatim.

## PyJWT API adjustments

None needed. Verified directly against the installed PyJWT 2.14.0 in `backend/.venv`:
`jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True)` returns a plain dict of JWK members, and
`jwt.PyJWK.from_dict(...)` accepts that dict merged with `{"kid": ..., "alg": ...}` and exposes `.key` as a
usable EC public key object. `jwt.exceptions.PyJWKClientConnectionError` and `PyJWTError` both exist as
documented. The brief's `_tok` helper's `over.pop("_alg", "ES384")` runs inside the `jwt.encode(...)` call
*after* `claims.update(over)`, so `_alg` is never merged into `claims` — the pop happens on the same `over`
dict object before its (already-executed) `.update` result is used for the `algorithm=` kwarg evaluation order
is left-to-right per Python semantics, but since `claims.update(over)` mutates `claims` using `over` as source
and `_alg` was never added as a key on `over` by the caller unless explicitly passed, in practice `_alg` is
only present when a test passes it, and it's popped in the same expression before `jwt.encode` sees `claims`.
No test in this brief passes `_alg`, so this was inert in practice but preserved exactly as specified.

## Tests and results (TDD evidence)

1. Wrote `backend/tests/test_oidc.py` (brief's content, verbatim) before any implementation.
2. Ran it — collection failed as expected:
   `ImportError: cannot import name 'oidc' from 'app.identity'` (module did not exist; equivalent failure to
   the brief's `ModuleNotFoundError` — both are "the module isn't there yet").
3. Implemented `oidc.py`, updated `principal.py`, `config.py`, `requirements.txt`, `.env.example`,
   `test_config.py`; deleted `firebase.py`.
4. Ran targeted tests:
   `cd backend && .venv/bin/python -m pytest tests/test_oidc.py tests/test_identity.py tests/test_config.py -q --no-cov`
   → **31 passed** in 1.85s, no warnings, no errors.
5. Ran full suite: `cd backend && .venv/bin/python -m pytest`
   → **455 passed** in 33.77s. Coverage 95.70% (floor 70%). No warnings.

## Firebase removal verification

- `grep -rn -i firebase backend/app backend/tests backend/requirements.txt .env.example` → no matches.
- `backend/.venv/bin/pip show firebase-admin` → `WARNING: Package(s) not found: firebase-admin` (absent, as
  required). Installed via `.venv/bin/pip install "PyJWT[crypto]==2.14.0"` (already present at that version)
  and removed via `.venv/bin/pip uninstall -y firebase-admin`. Did not touch firebase-admin's transitive deps
  (not trivially identifiable as unused-by-anything-else without deeper dependency-tree analysis; requirements.txt
  is the contract and it no longer lists firebase-admin).

## Trailer verification

`git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`,
present as its own paragraph, exactly as specified.

## Files changed (single commit `bf79d70`)

- `backend/app/identity/oidc.py` (new)
- `backend/app/identity/firebase.py` (deleted)
- `backend/app/identity/principal.py`
- `backend/app/core/config.py`
- `backend/requirements.txt`
- `backend/tests/test_config.py`
- `backend/tests/test_oidc.py` (new)
- `.env.example`

Commit message: `feat(identity): verify Logto/OIDC access tokens via JWKS; drop Firebase` +
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer. Committed directly on `main`, not pushed.

## Self-review

- **Completeness**: no remaining Firebase references anywhere in `backend/app`, `backend/tests`,
  `backend/requirements.txt`, or `.env.example` (grep-verified). `frontend/`, `README.md`, `docs/` intentionally
  left untouched (Tasks 2–3). All pre-existing identity tests (`test_identity.py`) pass unchanged — no edits
  made to that file. The three-segment regex gate in `principal.py` still runs before `verify_token` is called.
- **Quality**: `oidc.py` matches the brief's reference implementation exactly (single source of truth for JWKS
  client caching, lock-protected). Error messages are static strings only (`"invalid or expired token"`,
  `"authentication not configured"`, `"authentication temporarily unavailable"`) — never include the raw token
  or upstream provider exception text. No `print`/`logging` calls touch the token anywhere in the changed code.
- **Discipline**: single commit, no `--amend`, no branches, nothing pushed, no personal email introduced
  anywhere (confirmed via `git log` author identity uses the configured `johnnyrobot` GitHub noreply address,
  not a personal address).
- **Testing**: `test_oidc.py` uses real ES384 JWTs signed with a freshly generated in-test EC key (no shared
  fixtures, no mocked crypto) and monkeypatches only `oidc.signing_key_for` to substitute the test's own public
  key — signature verification, audience/issuer/expiry validation, and algorithm allow-listing are all exercised
  for real through `jwt.decode`. Full-suite and targeted runs both produced clean, warning-free output.

## Concerns

None. All steps in the brief completed as specified; no deviations beyond the PyJWT API confirmation (which
required no code changes).

---

## Fix round 1 (review findings)

Coordinator review folded in two Important findings and one Minor. All three addressed in commit `02f736b`.

### 1. (Important) Token `email` claim was persisted on provisioning

`backend/app/identity/principal.py`'s `get_principal_from_token` called
`_provision(session, claims["iss"], claims["sub"], claims.get("email"))`. Access tokens carry no verified
profile claims, so a bare `email` claim must never be trusted or persisted. Changed to
`_provision(session, claims["iss"], claims["sub"], None)` with a comment explaining why.

Added `test_token_email_claim_is_never_persisted` to `backend/tests/test_oidc.py`: provisions a user from a
token carrying `email="claimed@example.invalid"`, then asserts the resulting `AppUser.email is None`.

### 2. (Important) Malformed JWKS body / garbage signing key surfaced as 500

`oidc.verify_token`'s first `try/except` around `signing_key_for(token)` only caught
`PyJWKClientConnectionError` (→ 503) and `PyJWTError` (→ 401). A reachable-but-malformed JWKS body raises
`JSONDecodeError`/`ValueError` from PyJWKClient's key parsing, which was uncaught and became a bare 500.
Added `except (ValueError, KeyError, TypeError)` → `AuthError(503, "authentication temporarily unavailable")`
(provider-side fault, not a bad token). Also wrapped the `jwt.decode(...)` call: kept the existing
`except jwt.exceptions.PyJWTError` → 401, and added a trailing `except Exception` → `AuthError(401, "invalid
or expired token")` so a `signing_key_for` that returns an object whose `.key` is unusable garbage (not a
`PyJWTError`-raising failure, e.g. `TypeError` from `jwt.decode` handling a non-key object) becomes 401, not an
unhandled 500.

Added two tests to `backend/tests/test_oidc.py`:
- `test_malformed_jwks_body_is_503`: monkeypatches `oidc.signing_key_for` to raise `ValueError("bad jwks")` →
  asserts `503`.
- `test_garbage_signing_key_is_401_not_500`: monkeypatches `oidc.signing_key_for` to return an object whose
  `.key` is `object()` (not a usable key) → asserts `401` (not `500`).

### 3. (Minor, folded in) Issuer normalisation was inconsistent

`_jwks_url()` already normalised the issuer with `.rstrip('/')` when deriving the default JWKS URL, but
`verify_token`'s `jwt.decode(..., issuer=settings.OIDC_ISSUER, ...)` used the raw, un-normalised setting — so a
tenant configured with a trailing slash on `OIDC_ISSUER` would derive the correct JWKS URL but then fail issuer
validation against tokens whose `iss` claim (correctly) has no trailing slash. Added a single `_issuer() -> str`
helper (`settings.OIDC_ISSUER.rstrip("/")`) and used it both in `_jwks_url()` and in the `jwt.decode(...,
issuer=_issuer())` call, so there is exactly one place issuer normalisation happens.

Added `test_issuer_trailing_slash_is_normalised` to `backend/tests/test_oidc.py`: sets `OIDC_ISSUER` to
`ISS + "/"` (trailing slash) while the token's `iss` claim remains `ISS` (no trailing slash) — asserts the
token still verifies and `p.issuer == ISS`.

### Files changed (commit `02f736b`)

- `backend/app/identity/oidc.py` — added `_issuer()`, wired it into `_jwks_url()` and `jwt.decode(issuer=...)`;
  added `(ValueError, KeyError, TypeError)` → 503 around `signing_key_for`; added `except Exception` → 401
  around `jwt.decode`.
- `backend/app/identity/principal.py` — `_provision(..., None)` instead of `claims.get("email")`.
- `backend/tests/test_oidc.py` — four new tests (email-never-persisted, malformed-JWKS-503,
  garbage-key-401-not-500, issuer-trailing-slash-normalised).

### Tests and results

- Targeted: `cd backend && .venv/bin/python -m pytest tests/test_oidc.py tests/test_identity.py -q --no-cov` →
  **24 passed** in 2.30s, no warnings, no errors.
- Full suite: `cd backend && .venv/bin/python -m pytest` → **459 passed** in 26.86s. Coverage 95.76% (floor
  70%). No warnings.

### Trailer verification

`git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`,
present as its own paragraph.

### Self-review

- All three findings addressed exactly per the coordinator's ruling (exception types, status codes, and
  normalisation point specified were followed literally).
- No regression: pre-existing `test_identity.py` and `test_oidc.py` tests from round 1 all still pass unchanged.
- No new Firebase references introduced; no token/provider-error text leaked in any new error path (both new
  `except` branches raise static-string `AuthError`s, same pattern as the existing code).
- Single commit on `main`, not pushed, no `--amend`, no personal email.

### Concerns

None outstanding.
