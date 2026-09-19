"""
Route-level tests for OIDC authentication (ADR-0001, Logto).

Where tests/test_oidc.py exercises the verifier in isolation, this module
exercises the two callers that hold the identity contract:

- ``app.core.deps.get_current_user`` -- protected routes, **access** tokens,
  users keyed by ``User.auth_subject``.
- ``POST /api/auth/login`` -- sign-in, **ID** tokens (the only tokens that
  carry ``email``), including the one-time re-link of a legacy row whose
  ``auth_issuer`` is still NULL.

Tokens are signed with a local ES384 key and ``oidc.signing_key_for`` is
stubbed, exactly as in tests/test_oidc.py -- no network, no provider.
"""

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm
from sqlmodel import Session, select

from app.core import oidc
from app.core.config import settings
from app.core.database import engine
from app.main import app
from app.models.user import User, UserRole


KEY = ec.generate_private_key(ec.SECP384R1())
KID = "test-key"
ISS = "https://auth.example.invalid/oidc"
AUD = "https://api.calricula.local"
CLIENT_ID = "calricula-web-app"

# A protected route that only needs authentication (no role, no payload).
PROTECTED_URL = "/api/auth/me"
LOGIN_URL = "/api/auth/login"


def _tok(aud=AUD, **over):
    """Mint a signed token. Defaults to an access token (aud = API resource);
    pass ``aud=CLIENT_ID`` for an ID token."""
    now = int(time.time())
    claims = {
        "iss": ISS,
        "aud": aud,
        "sub": "user_" + uuid.uuid4().hex[:8],
        "iat": now,
        "exp": now + 300,
    }
    claims.update(over)
    return jwt.encode(claims, KEY, algorithm="ES384", headers={"kid": KID})


def _stub_signing_key(token: str) -> jwt.PyJWK:
    return jwt.PyJWK.from_dict(
        ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True) | {"kid": KID, "alg": "ES384"}
    )


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _reload(user_id) -> User:
    """Re-read a row in a fresh session: the request handler committed in its
    own session, so the fixture session's identity map is stale."""
    with Session(engine) as session:
        return session.exec(select(User).where(User.id == user_id)).one()


def _by_subject(sub: str):
    with Session(engine) as session:
        return session.exec(select(User).where(User.auth_subject == sub)).first()


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    """A configured provider, dev bypass and demo mode both off. The repo-root
    .env turns AUTH_DEV_MODE on, so every test must pin it explicitly."""
    monkeypatch.setattr(settings, "OIDC_ISSUER", ISS)
    monkeypatch.setattr(settings, "OIDC_AUDIENCE", AUD)
    monkeypatch.setattr(settings, "OIDC_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "OIDC_JWKS_URL", ISS + "/jwks")
    monkeypatch.setattr(settings, "OIDC_ALGORITHMS", ["ES384", "RS256"])
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(settings, "DEMO_MODE", False)
    monkeypatch.setattr(oidc, "signing_key_for", _stub_signing_key)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# =============================================================================
# (1) Dev tokens: looked up / provisioned by auth_subject, issuer "dev"
# =============================================================================

def test_dev_token_looks_user_up_by_auth_subject(client, db_session, monkeypatch):
    """A documented dev-* token resolves to the row whose auth_subject matches
    the dev subject -- the column rename is what the lookup keys on."""
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"test_devlookup_{unique}"
    monkeypatch.setitem(
        oidc._DEV_TOKEN_MAP,
        "dev-lookup-001",
        {"sub": sub, "email": f"devlookup_{unique}@calricula.com"},
    )
    existing = User(
        email=f"devlookup_{unique}@calricula.com",
        auth_subject=sub,
        auth_issuer="dev",
        full_name="Dev Lookup User",
        role=UserRole.CURRICULUM_CHAIR,
    )
    db_session.add(existing)
    db_session.commit()
    db_session.refresh(existing)

    resp = client.get(PROTECTED_URL, headers=_bearer("dev-lookup-001"))

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(existing.id)
    assert body["auth_subject"] == sub
    assert body["role"] == UserRole.CURRICULUM_CHAIR.value


def test_dev_token_auto_provisions_with_dev_issuer(client, monkeypatch):
    """An unknown dev subject is auto-provisioned as FACULTY with
    auth_issuer='dev' (dev claims carry no real issuer)."""
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"test_devnew_{unique}"
    email = f"devnew_{unique}@calricula.com"
    monkeypatch.setitem(
        oidc._DEV_TOKEN_MAP, "dev-newbie-001", {"sub": sub, "email": email}
    )

    resp = client.get(PROTECTED_URL, headers=_bearer("dev-newbie-001"))

    assert resp.status_code == 200
    created = _by_subject(sub)
    assert created is not None
    assert created.auth_issuer == "dev"
    assert created.email == email
    assert created.role == UserRole.FACULTY


# =============================================================================
# (2) Forged tokens are never authorized, even with AUTH_DEV_MODE on
# =============================================================================

def test_forged_token_is_401_even_in_dev_mode(client, monkeypatch):
    """A JWT we did not sign is rejected with 401 while the provider is
    configured -- dev mode only whitelists the documented dev-* strings."""
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    forged = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJhdHRhY2tlciJ9.not_a_real_signature"

    resp = client.get(PROTECTED_URL, headers=_bearer(forged))

    assert resp.status_code == 401
    assert resp.headers.get("WWW-Authenticate") == "Bearer"


# =============================================================================
# (3) /login with a real ID token
# =============================================================================

def test_login_with_id_token_provisions_user_with_email(client):
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_new_{unique}"
    email = f"new_{unique}@calricula.com"
    token = _tok(
        aud=CLIENT_ID, sub=sub, email=email, email_verified=True, name="New Person"
    )

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == email
    assert body["user"]["auth_subject"] == sub
    created = _by_subject(sub)
    assert created is not None
    assert created.full_name == "New Person"
    assert created.auth_issuer == ISS
    assert created.role == UserRole.FACULTY


# =============================================================================
# (4) One-time legacy re-link (pre-migration row -> Logto subject)
# =============================================================================

def test_login_relinks_legacy_row_by_verified_email(client, db_session):
    """A pre-migration row (auth_issuer NULL, subject still the retired
    provider's uid) is adopted by the Logto subject on first sign-in."""
    unique = uuid.uuid4().hex[:8]
    email = f"legacy_{unique}@calricula.com"
    legacy = User(
        email=email,
        auth_subject=f"fb_legacy_{unique}",
        auth_issuer=None,
        full_name="Legacy User",
        role=UserRole.ADMIN,
    )
    db_session.add(legacy)
    db_session.commit()
    db_session.refresh(legacy)
    legacy_id = legacy.id

    new_sub = f"logto_{unique}"
    token = _tok(aud=CLIENT_ID, sub=new_sub, email=email, email_verified=True)

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == str(legacy_id)
    relinked = _reload(legacy_id)
    assert relinked.auth_subject == new_sub
    assert relinked.auth_issuer == ISS
    # The role survives the re-link: this is the same person, not a new user.
    assert relinked.role == UserRole.ADMIN


def test_login_does_not_relink_on_unverified_email(client, db_session):
    """An unverified email is not proof of ownership -- it must never adopt an
    existing row; a separate user is provisioned instead."""
    unique = uuid.uuid4().hex[:8]
    email = f"legacy_unverified_{unique}@calricula.com"
    legacy = User(
        email=email,
        auth_subject=f"fb_legacy_{unique}",
        auth_issuer=None,
        full_name="Legacy User",
        role=UserRole.ADMIN,
    )
    db_session.add(legacy)
    db_session.commit()
    db_session.refresh(legacy)
    legacy_id = legacy.id

    new_sub = f"logto_{unique}"
    token = _tok(aud=CLIENT_ID, sub=new_sub, email=email, email_verified=False)

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    untouched = _reload(legacy_id)
    assert untouched.auth_subject == f"fb_legacy_{unique}"
    assert untouched.auth_issuer is None
    assert untouched.role == UserRole.ADMIN
    provisioned = _by_subject(new_sub)
    assert provisioned is not None
    assert provisioned.id != legacy_id
    assert provisioned.role == UserRole.FACULTY


def test_login_does_not_relink_a_row_that_already_has_an_issuer(client, db_session):
    """Only pre-migration rows (auth_issuer NULL) are adoptable. A row already
    linked to an issuer must not be hijacked by another subject claiming the
    same email."""
    unique = uuid.uuid4().hex[:8]
    email = f"linked_{unique}@calricula.com"
    linked = User(
        email=email,
        auth_subject=f"logto_owner_{unique}",
        auth_issuer=ISS,
        full_name="Linked User",
        role=UserRole.ADMIN,
    )
    db_session.add(linked)
    db_session.commit()
    db_session.refresh(linked)
    linked_id = linked.id

    attacker_sub = f"logto_attacker_{unique}"
    token = _tok(aud=CLIENT_ID, sub=attacker_sub, email=email, email_verified=True)

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    untouched = _reload(linked_id)
    assert untouched.auth_subject == f"logto_owner_{unique}"
    assert untouched.role == UserRole.ADMIN
    assert resp.json()["user"]["id"] != str(linked_id)


# =============================================================================
# (5) Demo mode
# =============================================================================

def test_demo_mode_login_rejects_non_demo_email(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    unique = uuid.uuid4().hex[:8]
    token = _tok(
        aud=CLIENT_ID,
        sub=f"logto_nondemo_{unique}",
        email=f"faculty_{unique}@calricula.com",
        email_verified=True,
    )

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 403
    assert "demo" in resp.json()["detail"].lower()
    assert _by_subject(f"logto_nondemo_{unique}") is None


def test_demo_mode_login_allows_demo_email(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_demo_{unique}"
    token = _tok(
        aud=CLIENT_ID,
        sub=sub,
        email=f"demo_{unique}@calricula.com",
        email_verified=True,
    )

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    assert _by_subject(sub) is not None


def test_demo_mode_protected_route_does_not_auto_provision(client, monkeypatch):
    """The demo gate lives at /login. A protected route must not silently
    create the account that /login would have refused."""
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_unknown_{unique}"

    resp = client.get(PROTECTED_URL, headers=_bearer(_tok(sub=sub)))

    assert resp.status_code == 403
    assert _by_subject(sub) is None


# =============================================================================
# (6) Token kinds are not interchangeable
# =============================================================================

def test_access_token_is_rejected_at_login(client):
    """/login reads profile claims, so it requires the ID token; an access
    token carries the API resource audience and must not be accepted."""
    resp = client.post(LOGIN_URL, headers=_bearer(_tok(aud=AUD)))

    assert resp.status_code == 401


def test_id_token_is_rejected_on_a_protected_route(client):
    """Protected routes require an access token scoped to this API."""
    resp = client.get(PROTECTED_URL, headers=_bearer(_tok(aud=CLIENT_ID)))

    assert resp.status_code == 401


def test_missing_credentials_is_401(client):
    assert client.get(PROTECTED_URL).status_code == 401
    assert client.post(LOGIN_URL).status_code == 401


def test_unconfigured_provider_fails_closed(client, monkeypatch):
    """No provider and no dev bypass: never authenticate, 503."""
    monkeypatch.setattr(settings, "OIDC_ISSUER", None)
    monkeypatch.setattr(settings, "OIDC_AUDIENCE", None)

    resp = client.get(PROTECTED_URL, headers=_bearer(_tok()))

    assert resp.status_code == 503


# =============================================================================
# (7) Only a *verified* email claim is ever trusted
# =============================================================================

def test_access_token_provisions_with_placeholder_email(client):
    """An access token carries no email claim, and users.email is NOT NULL, so
    the row gets an undeliverable placeholder rather than a guess."""
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_noemail_{unique}"

    resp = client.get(PROTECTED_URL, headers=_bearer(_tok(sub=sub)))

    assert resp.status_code == 200, resp.text
    created = _by_subject(sub)
    assert created.email == f"{sub}@oidc.invalid"
    assert created.full_name == "New User"


def test_login_with_unverified_email_provisions_placeholder(client):
    """An unverified email claim is attacker-chosen text. It must never be
    stored as the user's address -- other users see it in workflow responses."""
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_unverified_{unique}"
    token = _tok(
        aud=CLIENT_ID,
        sub=sub,
        email=f"victim_{unique}@calricula.com",
        email_verified=False,
        name="Claims To Be Someone",
    )

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 200, resp.text
    created = _by_subject(sub)
    assert created.email == f"{sub}@oidc.invalid"
    assert resp.json()["user"]["email"] == f"{sub}@oidc.invalid"


def test_login_replaces_placeholder_email_with_verified_email(client):
    """Once the same subject proves an address at sign-in, the placeholder the
    access-token path left behind is repaired."""
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_repair_{unique}"
    email = f"repair_{unique}@calricula.com"

    assert client.get(PROTECTED_URL, headers=_bearer(_tok(sub=sub))).status_code == 200
    assert _by_subject(sub).email == f"{sub}@oidc.invalid"

    resp = client.post(
        LOGIN_URL,
        headers=_bearer(
            _tok(aud=CLIENT_ID, sub=sub, email=email, email_verified=True)
        ),
    )

    assert resp.status_code == 200, resp.text
    assert _by_subject(sub).email == email


def test_login_does_not_overwrite_a_real_email(client, db_session):
    """Only a placeholder is repaired. A real stored address is never rewritten
    from a token, verified or not."""
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_stable_{unique}"
    stored = f"stored_{unique}@calricula.com"
    user = User(
        email=stored,
        auth_subject=sub,
        auth_issuer=ISS,
        full_name="Stable User",
        role=UserRole.FACULTY,
    )
    db_session.add(user)
    db_session.commit()

    resp = client.post(
        LOGIN_URL,
        headers=_bearer(
            _tok(
                aud=CLIENT_ID,
                sub=sub,
                email=f"other_{unique}@calricula.com",
                email_verified=True,
            )
        ),
    )

    assert resp.status_code == 200, resp.text
    assert _by_subject(sub).email == stored


def test_login_repairs_placeholder_full_name(client):
    """The access-token path has no `name` claim and stores "New User"; the ID
    token at sign-in carries one, so repair the display name too."""
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_name_{unique}"

    assert client.get(PROTECTED_URL, headers=_bearer(_tok(sub=sub))).status_code == 200
    assert _by_subject(sub).full_name == "New User"

    resp = client.post(
        LOGIN_URL,
        headers=_bearer(
            _tok(
                aud=CLIENT_ID,
                sub=sub,
                email=f"named_{unique}@calricula.com",
                email_verified=True,
                name="Real Name",
            )
        ),
    )

    assert resp.status_code == 200, resp.text
    assert _by_subject(sub).full_name == "Real Name"


def test_demo_mode_login_rejects_unverified_demo_email(client, monkeypatch):
    """The demo gate reads the verified address only -- an unverified
    'demo@...' claim must not open a demo deployment."""
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"logto_fakedemo_{unique}"
    token = _tok(
        aud=CLIENT_ID,
        sub=sub,
        email=f"demo_{unique}@calricula.com",
        email_verified=False,
    )

    resp = client.post(LOGIN_URL, headers=_bearer(token))

    assert resp.status_code == 403
    assert _by_subject(sub) is None


# =============================================================================
# (8) The legacy re-link window can be closed by configuration
# =============================================================================

def test_legacy_relink_can_be_disabled(client, db_session, monkeypatch):
    """Once every pre-migration user has signed in, the deployer sets
    AUTH_LEGACY_RELINK=false and email matching stops adopting rows."""
    monkeypatch.setattr(settings, "AUTH_LEGACY_RELINK", False)
    unique = uuid.uuid4().hex[:8]
    email = f"legacy_closed_{unique}@calricula.com"
    legacy = User(
        email=email,
        auth_subject=f"fb_legacy_{unique}",
        auth_issuer=None,
        full_name="Legacy User",
        role=UserRole.ADMIN,
    )
    db_session.add(legacy)
    db_session.commit()
    db_session.refresh(legacy)
    legacy_id = legacy.id

    new_sub = f"logto_{unique}"
    resp = client.post(
        LOGIN_URL,
        headers=_bearer(
            _tok(aud=CLIENT_ID, sub=new_sub, email=email, email_verified=True)
        ),
    )

    assert resp.status_code == 200, resp.text
    untouched = _reload(legacy_id)
    assert untouched.auth_subject == f"fb_legacy_{unique}"
    assert untouched.auth_issuer is None
    provisioned = _by_subject(new_sub)
    assert provisioned is not None
    assert provisioned.id != legacy_id


def test_legacy_relink_is_enabled_by_default():
    """Default-on: a deployment migrating from the retired provider works with
    no extra configuration."""
    assert settings.AUTH_LEGACY_RELINK is True


# =============================================================================
# (9) Demo mode is enforced on every request, not just at sign-in
# =============================================================================

def test_demo_mode_refuses_an_existing_non_demo_user(client, db_session, monkeypatch):
    """A row that predates DEMO_MODE (or was provisioned before it was turned
    on) must not keep access to a demo deployment."""
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"test_nondemo_{unique}"
    monkeypatch.setitem(
        oidc._DEV_TOKEN_MAP,
        "dev-nondemo-001",
        {"sub": sub, "email": f"faculty_{unique}@calricula.com"},
    )
    db_session.add(
        User(
            email=f"faculty_{unique}@calricula.com",
            auth_subject=sub,
            auth_issuer="dev",
            full_name="Regular Faculty",
            role=UserRole.FACULTY,
        )
    )
    db_session.commit()

    assert client.get(PROTECTED_URL, headers=_bearer("dev-nondemo-001")).status_code == 200

    monkeypatch.setattr(settings, "DEMO_MODE", True)
    resp = client.get(PROTECTED_URL, headers=_bearer("dev-nondemo-001"))

    assert resp.status_code == 403
    assert "demo" in resp.json()["detail"].lower()


def test_demo_mode_allows_an_existing_demo_user(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    unique = uuid.uuid4().hex[:8]
    sub = f"test_isdemo_{unique}"
    monkeypatch.setitem(
        oidc._DEV_TOKEN_MAP,
        "dev-isdemo-001",
        {"sub": sub, "email": f"demo_{unique}@calricula.com"},
    )
    db_session.add(
        User(
            email=f"demo_{unique}@calricula.com",
            auth_subject=sub,
            auth_issuer="dev",
            full_name="Demo Person",
            role=UserRole.FACULTY,
        )
    )
    db_session.commit()

    resp = client.get(PROTECTED_URL, headers=_bearer("dev-isdemo-001"))

    assert resp.status_code == 200
