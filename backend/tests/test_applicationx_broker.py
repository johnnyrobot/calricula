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


# --- ApplicationXBroker service ---------------------------------------------

import asyncio  # noqa: E402
import httpx  # noqa: E402

from app.services import applicationx_broker as broker_module  # noqa: E402
from app.services.applicationx_broker import ApplicationXBroker, BrokerError  # noqa: E402


def _transport(handler):
    return httpx.MockTransport(handler)


def test_forward_sends_only_allowlisted_headers(configured):
    seen = {}

    def handler(req):
        seen.update({"url": str(req.url), "headers": dict(req.headers), "body": req.content})
        return httpx.Response(200, json={"state": "ready"})

    b = ApplicationXBroker(transport=_transport(handler))
    status, body = asyncio.run(b.forward("host-contexts.resolve", user_token="tok-123", path_params={}, body={"context_id": "c"}))
    assert status == 200 and body == {"state": "ready"}
    assert seen["url"] == "https://ax.example.test/v1/host-contexts/resolve"
    assert seen["headers"]["authorization"] == "Bearer tok-123" and seen["headers"]["x-calricula-host"] == "calricula"
    assert "cookie" not in seen["headers"] and "x-forwarded-for" not in seen["headers"]


def test_unknown_operation_and_bad_path_param(configured):
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(200, json={})))
    for op, params, code in (("admin.nuke", {}, 404), ("chat.cancel", {"run_id": "../x"}, 400), ("sources.health", {"source_id": "A;drop"}, 400)):
        try:
            asyncio.run(b.forward(op, user_token="t", path_params=params, body=None))
            assert False, op
        except BrokerError as e:
            assert e.status == code


def test_upstream_5xx_and_timeout_become_typed_errors_without_leaking_body(configured):
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(500, text="secret stack trace token=abc")))
    try:
        asyncio.run(b.forward("sources.list", user_token="t", path_params={}, body=None))
        assert False
    except BrokerError as e:
        assert e.status == 502 and "abc" not in e.safe_message and "trace" not in e.safe_message

    def slow(req):
        raise httpx.ReadTimeout("slow")

    try:
        asyncio.run(ApplicationXBroker(transport=_transport(slow)).forward("sources.list", user_token="t", path_params={}, body=None))
        assert False
    except BrokerError as e:
        assert e.status == 504


def test_upstream_4xx_typed_state_passes_and_untyped_is_sanitized(configured):
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(403, json={"detail": "workspace access denied for user@x"})))
    status, body = asyncio.run(b.forward("chat.messages", user_token="t", path_params={}, body={"question": "q"}))
    assert status == 403 and body == {"detail": "forbidden"}


def test_stream_passes_events_and_last_event_id(configured):
    seen = {}

    def handler(req):
        seen["lei"] = req.headers.get("last-event-id")
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"id: 1\nevent: status\ndata: {}\n\nid: 2\nevent: done\ndata: {}\n\n")

    b = ApplicationXBroker(transport=_transport(handler))

    async def collect():
        return b"".join([chunk async for chunk in b.stream("chat.events", user_token="t", path_params={"run_id": str(uuid.uuid4())}, last_event_id="1")])

    out = asyncio.run(collect())
    assert b"event: done" in out and seen["lei"] == "1"


def test_stream_emits_idle_keepalive(configured, monkeypatch):
    """When the upstream body stalls longer than the keepalive interval,
    stream() yields an SSE keepalive comment instead of blocking forever."""
    monkeypatch.setattr(broker_module, "KEEPALIVE_SECONDS", 0.05)

    class SlowBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"id: 1\nevent: status\ndata: {}\n\n"
            await asyncio.sleep(0.2)
            yield b"id: 2\nevent: done\ndata: {}\n\n"

    def handler(req):
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=SlowBody())

    b = ApplicationXBroker(transport=_transport(handler))

    async def collect():
        chunks = []
        async for chunk in b.stream("chat.events", user_token="t", path_params={"run_id": str(uuid.uuid4())}, last_event_id=None):
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(collect())
    assert b": keepalive\n\n" in chunks
    assert b"".join(c for c in chunks if c != b": keepalive\n\n") == b"id: 1\nevent: status\ndata: {}\n\nid: 2\nevent: done\ndata: {}\n\n"
