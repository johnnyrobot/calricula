"""
Tests for the provider-neutral OIDC verifier (app/core/oidc.py).

ADR-0001: Logto (OIDC) is the only authentication provider. These tests need no
database and mirror the ApplicationX verifier's test suite
(backend/tests/test_oidc.py in the applicationx repo). The route-level contract
built on this verifier is pinned in tests/test_auth_oidc_routes.py.
"""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from jwt import PyJWKClient
from jwt.algorithms import ECAlgorithm

from app.core.config import settings
from app.core import oidc


KEY = ec.generate_private_key(ec.SECP384R1())
KID = "test-key"
ISS = "https://auth.example.invalid/oidc"
AUD = "https://api.calricula.local"
CLIENT_ID = "calricula-web-app"

# Captured before the autouse `configured` fixture stubs oidc.signing_key_for,
# so tests exercising the real JWKS-backed implementation can restore it.
_real_signing_key_for = oidc.signing_key_for


def _tok(**over):
    now = int(time.time())
    claims = {
        "iss": ISS,
        "aud": AUD,
        "sub": "user_" + uuid.uuid4().hex[:8],
        "iat": now,
        "exp": now + 300,
    }
    alg = over.pop("_alg", "ES384")
    claims.update(over)
    return jwt.encode(claims, KEY, algorithm=alg, headers={"kid": KID})


def _stub_signing_key(token: str) -> jwt.PyJWK:
    return jwt.PyJWK.from_dict(
        ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True) | {"kid": KID, "alg": "ES384"}
    )


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", ISS)
    monkeypatch.setattr(settings, "OIDC_AUDIENCE", AUD)
    monkeypatch.setattr(settings, "OIDC_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", ISS + "/jwks")
    monkeypatch.setattr(settings, "OIDC_ALGORITHMS", ["ES384", "RS256"])
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(oidc, "signing_key_for", _stub_signing_key)


# =============================================================================
# verify_access_token
# =============================================================================

def test_valid_access_token_returns_claims():
    claims = oidc.verify_access_token(_tok(sub="user_abc"))
    assert claims["sub"] == "user_abc"
    assert claims["iss"] == ISS
    assert claims["aud"] == AUD


@pytest.mark.parametrize(
    "over",
    [
        {"aud": "https://other.invalid"},
        {"iss": "https://evil.invalid/oidc"},
        {"exp": int(time.time()) - 120},
    ],
)
def test_wrong_audience_issuer_or_expired_is_401(over):
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok(**over))
    assert e.value.status == 401


def test_disallowed_algorithm_is_401(monkeypatch):
    # RS256 key material differs from the ES384 key used to sign; simplest way
    # to produce a "disallowed algorithm" case is to restrict the accepted set
    # away from the token's actual algorithm.
    monkeypatch.setattr(settings, "OIDC_ALGORITHMS", ["RS256"])
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok())
    assert e.value.status == 401


def test_unconfigured_is_503(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", None)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok())
    assert e.value.status == 503


def test_jwks_connection_error_is_503(monkeypatch):
    def boom(token):
        raise jwt.exceptions.PyJWKClientConnectionError("down")

    monkeypatch.setattr(oidc, "signing_key_for", boom)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok())
    assert e.value.status == 503


def test_malformed_jwks_body_is_503(monkeypatch):
    def boom(token):
        raise ValueError("bad jwks")

    monkeypatch.setattr(oidc, "signing_key_for", boom)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok())
    assert e.value.status == 503


def test_error_detail_never_echoes_token():
    bad = _tok(aud="x")
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(bad)
    assert bad[:20] not in str(e.value.detail)


def test_issuer_trailing_slash_is_normalised(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", ISS + "/")
    claims = oidc.verify_access_token(_tok(sub="user_trailing_slash"))
    assert claims["sub"] == "user_trailing_slash"


# =============================================================================
# verify_id_token vs verify_access_token (different audiences)
# =============================================================================

def test_id_token_is_verified_against_client_id():
    id_tok = _tok(sub="user_id_tok", aud=CLIENT_ID)
    claims = oidc.verify_id_token(id_tok)
    assert claims["sub"] == "user_id_tok"
    assert claims["aud"] == CLIENT_ID


def test_id_token_rejected_as_access_token():
    id_tok = _tok(sub="user_id_tok", aud=CLIENT_ID)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(id_tok)
    assert e.value.status == 401


def test_access_token_rejected_as_id_token():
    access_tok = _tok(sub="user_access_tok", aud=AUD)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_id_token(access_tok)
    assert e.value.status == 401


def test_id_token_unconfigured_client_id_is_503(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_CLIENT_ID", None)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_id_token(_tok(aud=CLIENT_ID))
    assert e.value.status == 503


# =============================================================================
# dev tokens / resolve_dev_token / verify_bearer
# =============================================================================

def test_resolve_dev_token_returns_sub_when_dev_mode_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    claims = oidc.resolve_dev_token("dev-faculty-001")
    assert claims is not None
    assert claims["sub"] == "test_faculty_001"
    assert claims["email"] == "faculty@calricula.com"
    assert claims["email_verified"] is True


def test_resolve_dev_token_returns_none_when_dev_mode_off():
    assert settings.AUTH_DEV_MODE is False
    assert oidc.resolve_dev_token("dev-faculty-001") is None


def test_resolve_dev_token_returns_none_for_unknown_token(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    assert oidc.resolve_dev_token("not-a-dev-token") is None


def test_verify_bearer_dev_mode_off_unconfigured_is_503(monkeypatch):
    monkeypatch.setattr(settings, "OIDC_ISSUER", None)
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_bearer("dev-faculty-001")
    assert e.value.status == 503


def test_verify_bearer_dev_shaped_token_with_dev_mode_off_and_provider_configured_is_401():
    # Provider is configured (autouse fixture), AUTH_DEV_MODE is off: a
    # dev-shaped token must be treated as an ordinary (invalid) token, never
    # as a dev identity.
    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_bearer("dev-faculty-001")
    assert e.value.status == 401


def test_verify_bearer_accepts_dev_token_when_dev_mode_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    claims = oidc.verify_bearer("dev-faculty-001")
    assert claims["sub"] == "test_faculty_001"


def test_verify_bearer_accepts_real_access_token():
    claims = oidc.verify_bearer(_tok(sub="user_real"))
    assert claims["sub"] == "user_real"


# =============================================================================
# Real PyJWKClient exercise: unusable key set, key rotation
# =============================================================================

def _stub_fetch_data(state):
    """Replace PyJWKClient.fetch_data so tests control what the JWKS endpoint
    returns without a network call, while still exercising the real Tier 1
    (JWK-set) and Tier 2 (per-key) caching behaviour in jwt.jwks_client."""

    def fetch_data(self):
        data = state["body"]
        if self.jwk_set_cache is not None and isinstance(data, dict):
            try:
                self.jwk_set_cache.put(jwt.PyJWKSet.from_dict(data))
            except jwt.exceptions.PyJWKSetError:
                pass
        return data

    return fetch_data


def test_unusable_jwks_key_set_is_503_not_401(monkeypatch):
    state = {"body": {"keys": "x"}}
    monkeypatch.setattr(PyJWKClient, "fetch_data", _stub_fetch_data(state))
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", "https://jwks.invalid/oidc/jwks")
    monkeypatch.setattr(oidc, "signing_key_for", _real_signing_key_for)
    monkeypatch.setattr(oidc, "_client", None)
    monkeypatch.setattr(oidc, "_client_url", None)

    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(_tok())
    assert e.value.status == 503


def test_rotated_key_is_rejected_after_jwks_cache_refresh(monkeypatch):
    """cache_keys=False means PyJWKClient never wraps get_signing_key in an
    unbounded, non-expiring lru_cache. A kid served once must stop being
    trusted once the tenant rotates it out of the JWKS and the Tier 1
    JWK-set cache refreshes."""
    key1 = ec.generate_private_key(ec.SECP384R1())
    key2 = ec.generate_private_key(ec.SECP384R1())
    jwk1 = ECAlgorithm.to_jwk(key1.public_key(), as_dict=True) | {
        "kid": "rot-k1",
        "alg": "ES384",
        "use": "sig",
    }
    jwk2 = ECAlgorithm.to_jwk(key2.public_key(), as_dict=True) | {
        "kid": "rot-k2",
        "alg": "ES384",
        "use": "sig",
    }
    state = {"body": {"keys": [jwk1]}}

    monkeypatch.setattr(PyJWKClient, "fetch_data", _stub_fetch_data(state))
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", "https://jwks.invalid/oidc/jwks")
    monkeypatch.setattr(oidc, "signing_key_for", _real_signing_key_for)
    monkeypatch.setattr(oidc, "_client", None)
    monkeypatch.setattr(oidc, "_client_url", None)

    now = int(time.time())
    token1 = jwt.encode(
        {"iss": ISS, "aud": AUD, "sub": "user_rot", "iat": now, "exp": now + 300},
        key1,
        algorithm="ES384",
        headers={"kid": "rot-k1"},
    )

    claims = oidc.verify_access_token(token1)
    assert claims["sub"] == "user_rot"

    # Tenant rotates: k1 is removed from the JWKS, k2 takes its place. Force
    # the Tier 1 JWK-set cache to refresh (normal lifespan is 600s) via the
    # documented cache attribute rather than waiting it out.
    state["body"] = {"keys": [jwk2]}
    oidc._client.jwk_set_cache.jwk_set_with_timestamp = None

    with pytest.raises(oidc.AuthError) as e:
        oidc.verify_access_token(token1)
    assert e.value.status == 401
