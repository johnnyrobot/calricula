# Final-review fix wave — Swap Firebase for Logto (OIDC)

Branch: `main` at `a3c4ef4` → new commit `b719a4a` (not pushed).

## Findings addressed

### I1 (Important) — rotated keys trusted until restart

`backend/app/identity/oidc.py`, `signing_key_for`: `PyJWKClient(url, cache_keys=True, ...)`
changed to `cache_keys=False`. In PyJWT 2.14 (`jwt/jwks_client.py`), `cache_keys=True` wraps
`self.get_signing_key` in `functools.lru_cache(maxsize=max_cached_keys)` — an unbounded-by-time
cache keyed on `kid`, evicted only by LRU size, never by expiry. A `kid` served once therefore
stayed trusted for the life of the process even after the tenant removed it from the JWKS. With
`cache_keys=False`, every lookup calls the real `get_signing_key`, which re-derives the signing
keys from `get_jwk_set()` each time. The JWK-set cache (Tier 1, `cache_jwk_set=True` by default,
`lifespan=600`) is untouched, so this does not reintroduce a per-request network fetch — it only
removes the unbounded per-key cache layered on top of it.

Test: `backend/tests/test_oidc.py::test_rotated_key_is_rejected_after_jwks_cache_refresh`.
Builds two ES384 keypairs (`rot-k1`, `rot-k2`), monkeypatches `PyJWKClient.fetch_data` (the class
method that performs the actual HTTP fetch and, on success, calls `self.jwk_set_cache.put(...)`)
to serve a JSON body from a mutable `state["body"]` dict instead of hitting the network. It
restores the *real* `oidc.signing_key_for` (captured at module import time into
`_real_signing_key_for`, before the autouse `configured` fixture replaces it with a stub) and
resets `oidc._client` / `oidc._client_url` to `None` so a fresh `PyJWKClient` is built against
`settings.OIDC_JWKS_URL = "https://jwks.invalid/oidc/jwks"`. Flow:

1. JWKS serves `[rot-k1]`. A token signed with `rot-k1`/`kid=rot-k1` verifies successfully via
   `get_principal_from_token`.
2. JWKS is rotated server-side to `[rot-k2]` only (`state["body"]` mutated).
3. The Tier 1 JWK-set cache is forced to refresh by clearing
   `oidc._client.jwk_set_cache.jwk_set_with_timestamp = None` (the documented cache-state
   attribute in `jwt/jwk_set_cache.py`'s `JWKSetCache`) rather than waiting out the 600s lifespan.
4. The same `rot-k1` token is presented again. `PyJWKClient.get_signing_key` re-fetches the JWK
   set (now `[rot-k2]`), fails to `match_kid` for `rot-k1`, forces one more refresh per its
   cooldown logic (still `[rot-k2]`), and raises `jwt.exceptions.PyJWKClientError`. That is a
   `PyJWTError` subclass and is caught by the existing generic handler in `verify_token`, so the
   request is rejected with **401** (asserted via `HTTPException.status_code`).

PyJWT internals relied on: `jwt/jwks_client.py` — `PyJWKClient.__init__` (the `cache_keys` /
`lru_cache` wrapping, docstring's own "Tier 1 vs Tier 2" description), `fetch_data` (writes to
`self.jwk_set_cache` on success only), `get_jwk_set(refresh)` (reads `self.jwk_set_cache.get()`
unless `refresh=True`), `get_signing_key` (cooldown/refresh-once-more logic on a `kid` miss); and
`jwt/jwk_set_cache.py` — `JWKSetCache.jwk_set_with_timestamp` / `.get()` / `.is_expired()`, which
is the attribute the test clears to force a refresh without waiting on `lifespan`.

### I1b — provider-fault mapping for unusable JWKS

`backend/app/identity/oidc.py`, `verify_token`: added
`except PyJWKSetError as e: raise AuthError(503, "authentication temporarily unavailable") from e`
before the existing generic `except jwt.exceptions.PyJWTError` handler (imported
`from jwt.exceptions import PyJWKSetError`). `PyJWKSetError` is raised by
`jwt/api_jwk.py`'s `PyJWKSet.__init__`/`from_dict` when `keys` isn't a list, or is empty, or
none of the entries are usable — it's a `PyJWTError` subclass, so it would previously fall
through to the generic 401 handler despite being a provider-side fault, not a bad token.

Test: `test_unusable_jwks_key_set_is_503_not_401` — stub JWKS body `{"keys": "x"}` (not a list,
so `PyJWKSet.__init__` raises `PyJWKSetError("Invalid JWK Set value")`); asserts
`HTTPException.status_code == 503`.

### M3 — `OIDC_ALGORITHMS` format documented

`.env.example`: added a commented example line under the existing `OIDC_JWKS_URL` block:
```
# Algorithms accepted for token signature verification, optional: defaults to ["ES384", "RS256"].
# List settings are JSON arrays (same convention as CORS_ORIGINS).
# OIDC_ALGORITHMS=["ES384","RS256"]
```

### M4 — compose-only JWKS path documented

`README.md`, "Identity provider (Logto)" section: added a paragraph after the
`docker compose --profile auth up -d logto` block noting that when the API runs inside compose
alongside the `auth` profile it must reach Logto by service name
(`OIDC_JWKS_URL=http://logto:3001/oidc/jwks`) while `OIDC_ISSUER` stays
`http://localhost:3301/oidc` (the `iss` Logto emits for its published endpoint). Verified against
`docker-compose.yml`'s `logto` service: `ports: ["3301:3001", "3302:3002"]` — host 3301 maps to
container port 3001, confirming `logto:3001` is the correct in-network address.

### M7 — cosmetics

- `backend/app/identity/oidc.py`, `verify_token`: `url = _jwks_url()` → bare `_jwks_url()` call
  (kept for its 503-when-unconfigured side effect; the return value was never used — the actual
  URL is re-resolved inside `signing_key_for`).
- `backend/tests/test_oidc.py`, `_tok`: reordered so `over.pop("_alg", "ES384")` happens *before*
  `claims.update(over)`. Previously `claims.update(over)` ran first, so a caller passing `_alg=`
  would leak a stray `"_alg"` key into the encoded JWT's claims before being popped from `over`
  for the `jwt.encode(algorithm=...)` call.

## Commands and output

```
$ cd backend && .venv/bin/python -m pytest tests/test_oidc.py tests/test_identity.py -q --no-cov
..........................                                               [100%]
(26 passed, 0 failed)

$ .venv/bin/python -m pytest --no-cov -q
461 passed (461 '.' characters counted across the dot-progress output; no
failures/errors; exit code 0). Note: this repo's pytest quiet-mode does not
print a "N passed in Xs" summary line — verified via exit code + dot count.

$ .venv/bin/python -m pytest -q      # with coverage (pytest.ini: --cov-fail-under=70)
...
app/identity/oidc.py                            40      0   100%
...
TOTAL                                         1961     77    96%
Required test coverage of 70% reached. Total coverage: 96.07%
(exit code 0, no warnings, no failures)
```

## Commit

```
b719a4a fix(identity): never cache per-key JWKS lookups; typed 503 for unusable key sets; document algorithms and compose JWKS URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

4 files changed: `.env.example`, `README.md`, `backend/app/identity/oidc.py`,
`backend/tests/test_oidc.py` (94 insertions, 3 deletions). Not pushed, no branches created.
Trailer verified with `git interpret-trailers --parse`. Working tree clean after commit.
