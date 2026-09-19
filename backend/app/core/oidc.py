"""
Logto / generic OIDC access & ID token verification (ADR-0001).

Calricula is moving from Firebase Authentication to Logto, a standard OIDC
provider, so tokens are verified with a JSON Web Key Set (JWKS) and PyJWT --
no vendor SDK. This module is modelled on the ApplicationX verifier
(app/identity/oidc.py in the applicationx repo) but reimplemented here rather
than imported, since the two backends are separate deployables.

This task adds the verifier next to the existing Firebase one
(app/core/firebase.py); Task 2 switches `get_current_user` to call
`verify_bearer` and removes firebase.py and the FIREBASE_* settings.
"""

import threading
from typing import Optional

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKSetError

from app.core.config import settings


class AuthError(Exception):
    """Raised by the verifier; callers (Task 2's get_current_user) map
    `status`/`detail` onto an HTTPException. Detail strings are constant and
    never include the token."""

    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(detail)


# Dev-mode token -> synthetic claims, copied from app/core/firebase.py's
# dev_user_map (uid -> sub). Only ever consulted when settings.AUTH_DEV_MODE
# is on. Kept in sync by hand until Task 2 deletes firebase.py, at which
# point this becomes the single source of truth.
_DEV_TOKEN_MAP = {
    "dev-demo-001": {"sub": "test_demo_001", "email": "demo@calricula.com"},
    "dev-faculty-001": {"sub": "test_faculty_001", "email": "faculty@calricula.com"},
    "dev-faculty-002": {"sub": "test_faculty_002", "email": "faculty2@calricula.com"},
    "dev-faculty-003": {"sub": "test_faculty_003", "email": "faculty3@calricula.com"},
    "dev-chair-001": {"sub": "test_chair_001", "email": "chair@calricula.com"},
    "dev-articulation-001": {"sub": "test_articulation_001", "email": "articulation@calricula.com"},
    "dev-admin-001": {"sub": "test_admin_001", "email": "admin@calricula.com"},
}

_client: Optional[PyJWKClient] = None
_client_url: Optional[str] = None
_lock = threading.Lock()


def _issuer() -> str:
    return (settings.OIDC_ISSUER or "").rstrip("/")


def _jwks_url() -> str:
    if not settings.OIDC_ISSUER or not settings.OIDC_AUDIENCE:
        raise AuthError(503, "authentication not configured")
    return settings.OIDC_JWKS_URL or f"{_issuer()}/jwks"


def signing_key_for(token: str) -> jwt.PyJWK:
    """Resolve the signing key for `token` from the tenant JWKS (cached per
    JWKS URL). Tests replace this function directly."""
    global _client, _client_url
    url = _jwks_url()
    with _lock:
        if _client is None or _client_url != url:
            # cache_keys=False: never cache per-kid signing-key lookups.
            # PyJWT's per-key cache (Tier 2) is an lru_cache with no
            # time-based expiry, so a kid served once would stay trusted
            # even after the tenant rotates it out of the JWKS. The JWK-set
            # cache (Tier 1, lifespan=600) still avoids a network fetch on
            # every request.
            _client = PyJWKClient(url, cache_keys=False, lifespan=600, timeout=5)
            _client_url = url
    return _client.get_signing_key_from_jwt(token)


def _verify(token: str, audience: Optional[str]) -> dict:
    if not audience:
        raise AuthError(503, "authentication not configured")
    _jwks_url()  # raises 503 when unconfigured, before touching the token

    try:
        key = signing_key_for(token)
    except jwt.exceptions.PyJWKClientConnectionError as e:
        raise AuthError(503, "authentication temporarily unavailable") from e
    except PyJWKSetError as e:
        # A reachable JWKS response that is structurally unusable (e.g.
        # "keys" isn't a list, or entries are missing "kty") is a
        # provider-side fault, not a bad token.
        raise AuthError(503, "authentication temporarily unavailable") from e
    except jwt.exceptions.PyJWTError as e:
        raise AuthError(401, "invalid or expired token") from e
    except (ValueError, KeyError, TypeError) as e:
        # A reachable but malformed JWKS body (bad JSON, missing/invalid key
        # members) is a provider-side fault, not a bad token.
        raise AuthError(503, "authentication temporarily unavailable") from e

    try:
        return jwt.decode(
            token,
            key.key,
            algorithms=list(settings.OIDC_ALGORITHMS),
            audience=audience,
            issuer=_issuer(),
            leeway=60,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except jwt.exceptions.PyJWTError as e:
        raise AuthError(401, "invalid or expired token") from e
    except Exception as e:
        raise AuthError(401, "invalid or expired token") from e


def verify_access_token(token: str) -> dict:
    """Verify a Logto access token scoped to Calricula's own API resource
    (`aud` = OIDC_AUDIENCE). This is what protected API endpoints require."""
    return _verify(token, settings.OIDC_AUDIENCE)


def verify_id_token(token: str) -> dict:
    """Verify a Logto ID token (`aud` = OIDC_CLIENT_ID, Calricula's web app
    id). Used only at sign-in (/api/auth/login) to read email/name -- access
    tokens for an API resource do not carry profile claims."""
    return _verify(token, settings.OIDC_CLIENT_ID)


def resolve_dev_token(token: str) -> Optional[dict]:
    """Return synthetic claims for a documented dev-* token when
    settings.AUTH_DEV_MODE is on; None otherwise.

    A token that happens to be dev-shaped (one of the seven known dev-*
    strings) while AUTH_DEV_MODE is off must never be treated as a dev
    identity -- this returns None so the caller falls through to ordinary
    (and in that case necessarily failing) token verification.
    """
    if not settings.AUTH_DEV_MODE:
        return None
    entry = _DEV_TOKEN_MAP.get(token)
    if entry is None:
        return None
    return {"sub": entry["sub"], "email": entry["email"], "email_verified": True}


def verify_bearer(token: str) -> dict:
    """Verify a bearer token for API calls: a documented dev-* token when
    AUTH_DEV_MODE is on, otherwise a real Logto access token via JWKS.

    Fails closed: when the provider is unconfigured and AUTH_DEV_MODE is
    off, this raises AuthError(503, ...) rather than accepting the token --
    mirroring app/core/firebase.py's fail-closed rule. This is what Task 2's
    get_current_user calls.
    """
    dev_claims = resolve_dev_token(token)
    if dev_claims is not None:
        return dev_claims
    return verify_access_token(token)
