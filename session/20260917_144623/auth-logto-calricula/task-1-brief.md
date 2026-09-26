### Task 1: Backend OIDC verifier and settings (no schema change)

**Files:** Create `backend/app/core/oidc.py`, `backend/tests/test_oidc.py`; modify `backend/app/core/config.py`, `backend/requirements.txt`; delete `backend/app/core/firebase.py` after Task 2 switches callers.

**Interfaces:** Settings `OIDC_ISSUER`, `OIDC_AUDIENCE` (Calricula API resource indicator), `OIDC_JWKS_URL` (default `issuer + "/jwks"`), `OIDC_CLIENT_ID` (the Calricula web app id — the ID token's `aud`), `OIDC_ALGORITHMS=["ES384","RS256"]`; remove `FIREBASE_PROJECT_ID`/`FIREBASE_SERVICE_ACCOUNT_PATH`. `_production_safety` (existing validator around `config.py:95-110`) requires `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_CLIENT_ID` in production and keeps refusing `AUTH_DEV_MODE`/`DEMO_MODE`.
`oidc.verify_access_token(token) -> dict` (audience = API resource) and `oidc.verify_id_token(token) -> dict` (audience = client id; used only by `/api/auth/login` to read `email`/`name`); `oidc.resolve_dev_token(token) -> dict | None` carrying the seven-entry dev map from `firebase.py:66-74` unchanged (`uid` → `sub`, keep `email`); `oidc.signing_key_for(token)` for tests to monkeypatch. Same status semantics as the ApplicationX verifier (401 invalid, 503 unconfigured/JWKS down); dev tokens accepted only when `AUTH_DEV_MODE`; when the provider is unconfigured and `AUTH_DEV_MODE` is off → 503 (preserves `firebase.py:118-127`'s fail-closed rule).

- [ ] Tests first (mirror the ApplicationX `test_oidc.py`: valid access token, wrong aud/iss/exp, disallowed alg, unconfigured 503, JWKS 503, dev token only in dev mode, ID token audience = client id).
- [ ] Implement; `pip uninstall firebase-admin`; `PyJWT[crypto]==2.14.0`; drop the `httpx` pin comment that references firebase-admin (`requirements.txt:33`).
- [ ] Commit `feat(auth): OIDC access/ID token verification via JWKS (Logto), keep dev map`.

