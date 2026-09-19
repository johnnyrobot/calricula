import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User, UserRole
import uuid


def _user(role=UserRole.FACULTY):
    return User(id=uuid.uuid4(), email="faculty@calricula.com", full_name="F", role=role, auth_subject="test_faculty_001", auth_issuer="dev")


@pytest.fixture
def as_faculty():
    app.dependency_overrides[get_current_user] = lambda: _user()
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "APPLICATIONX_EMBED_ENABLED", True)
    monkeypatch.setattr(settings, "APPLICATIONX_API_ORIGIN", "https://ax.example.test")
    monkeypatch.setattr(settings, "APPLICATIONX_ORGANIZATION_REF", "lamc")
    monkeypatch.setattr(settings, "APPLICATIONX_CAMPUS_REF", "LAMC")
    monkeypatch.setattr(settings, "APPLICATIONX_STANDALONE_URL", "https://ax.example.test/app")


def test_status_requires_auth():
    assert TestClient(app).get("/api/applicationx/status").status_code in (401, 403, 503)


def test_status_disabled_by_default(as_faculty):
    body = as_faculty.get("/api/applicationx/status").json()
    assert body == {"enabled": False, "organization_ref": None, "campus_ref": None, "standalone_url": None, "api_version": None}


def test_status_enabled_only_when_fully_configured(as_faculty, configured, monkeypatch):
    assert as_faculty.get("/api/applicationx/status").json()["enabled"] is True
    monkeypatch.setattr(settings, "APPLICATIONX_CAMPUS_REF", None)
    assert as_faculty.get("/api/applicationx/status").json()["enabled"] is False


def test_production_requires_https_origin_when_enabled():
    from app.core.config import Settings

    with pytest.raises(ValueError, match="APPLICATIONX_API_ORIGIN"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            ALLOWED_HOSTS=["calricula.example"],
            OIDC_ISSUER="https://auth.example.test/oidc",
            OIDC_AUDIENCE="https://api.calricula.test",
            OIDC_CLIENT_ID="calricula-web",
            APPLICATIONX_EMBED_ENABLED=True,
            APPLICATIONX_API_ORIGIN="http://ax.internal",
            APPLICATIONX_ORGANIZATION_REF="lamc",
            APPLICATIONX_CAMPUS_REF="LAMC",
        )


def test_production_accepts_https_origin_when_enabled():
    from app.core.config import Settings

    s = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        ALLOWED_HOSTS=["calricula.example"],
        OIDC_ISSUER="https://auth.example.test/oidc",
        OIDC_AUDIENCE="https://api.calricula.test",
        OIDC_CLIENT_ID="calricula-web",
        APPLICATIONX_EMBED_ENABLED=True,
        APPLICATIONX_API_ORIGIN="https://ax.example.edu",
        APPLICATIONX_ORGANIZATION_REF="lamc",
        APPLICATIONX_CAMPUS_REF="LAMC",
    )
    assert s.APPLICATIONX_API_ORIGIN == "https://ax.example.edu"
