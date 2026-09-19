"""
WS-1 security regression tests.

These lock the security properties that the dependency bump in this workstream
is meant to preserve/establish:

- Protected endpoints never authorize a missing or forged credential.
- The Host header is validated by TrustedHostMiddleware (defense-in-depth that
  pairs with the Starlette BadHost fix, CVE-2026-48710).

They are deliberately independent of whether an OIDC provider is configured: in
CI it is not, so a forged token fails closed with 503; with a provider
configured a forged token is rejected with 401. Either way it is never
authorized (never 2xx). tests/test_auth_oidc_routes.py pins the configured
case (401) exactly.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.main import app


client = TestClient(app)

# A protected endpoint that requires authentication.
PROTECTED_URL = "/api/compliance/ccn-match"
PROTECTED_BODY = {"title": "Test Course", "subject_code": "MATH", "units": 4.0}


# =============================================================================
# Credential rejection
# =============================================================================

def test_protected_endpoint_rejects_missing_token():
    """No Authorization header -> 401, never authorized."""
    resp = client.post(PROTECTED_URL, json=PROTECTED_BODY)
    assert resp.status_code == 401


def test_protected_endpoint_rejects_forged_token():
    """A forged (not provider-signed) JWT is never authorized.

    Accept any hard rejection: 401 (a configured provider rejects it) or 503
    (an unconfigured provider fails closed). The invariant under test is that a
    forged credential never yields a 2xx.
    """
    forged = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJhdHRhY2tlciJ9.not_a_real_signature"
    resp = client.post(
        PROTECTED_URL,
        json=PROTECTED_BODY,
        headers={"Authorization": f"Bearer {forged}"},
    )
    assert resp.status_code in (401, 403, 503)
    assert resp.status_code < 200 or resp.status_code >= 300  # never 2xx


# =============================================================================
# Host-header validation (CVE-2026-48710 / BadHost defense-in-depth)
# =============================================================================

def _host_app() -> FastAPI:
    mini = FastAPI()
    mini.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.calricula.test"])

    @mini.get("/ping")
    def ping():
        return {"ok": True}

    return mini


def test_trusted_host_allows_known_host():
    mini = _host_app()
    trusted = TestClient(mini, base_url="http://api.calricula.test")
    assert trusted.get("/ping").status_code == 200


def test_trusted_host_rejects_untrusted_host():
    mini = _host_app()
    untrusted = TestClient(mini, base_url="http://evil.example.com")
    assert untrusted.get("/ping").status_code == 400


def test_main_app_wires_trusted_host_middleware():
    """The application must register TrustedHostMiddleware so production can
    restrict ALLOWED_HOSTS and reject forged Host headers."""
    assert any(m.cls is TrustedHostMiddleware for m in app.user_middleware)
