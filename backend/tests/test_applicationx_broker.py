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
    monkeypatch.setattr(settings, "APPLICATIONX_ORGANIZATION_REF", "demo-college")
    monkeypatch.setattr(settings, "APPLICATIONX_CAMPUS_REF", "MAIN")
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


@pytest.mark.parametrize(
    "origin",
    [
        "http://ax.internal",
        "https://user:pw@ax.example.edu",
        "https://ax.example.edu?x=1",
        "https://ax.example.edu#frag",
        "https://ax.example.edu/v1",
        "https://",
        "",
    ],
)
def test_production_requires_https_origin_when_enabled(origin):
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
            APPLICATIONX_API_ORIGIN=origin,
            APPLICATIONX_ORGANIZATION_REF="demo-college",
            APPLICATIONX_CAMPUS_REF="MAIN",
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
        APPLICATIONX_ORGANIZATION_REF="demo-college",
        APPLICATIONX_CAMPUS_REF="MAIN",
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
    for op, params, code in (("admin.nuke", {}, 404), ("sources.health", {"source_id": "../x"}, 400), ("sources.health", {"source_id": "A;drop"}, 400)):
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
    status, body = asyncio.run(b.forward("sources.list", user_token="t", path_params={}, body=None))
    assert status == 403 and body == {"detail": "forbidden"}


def test_upstream_4xx_typed_state_is_projected_to_allowlist(configured):
    """A typed host failure keeps only {state, message, retryable}; extra keys
    (debug text, ids) never cross the boundary and message is bounded."""
    upstream = {"state": "access_required", "message": "Ask your admin. " + "x" * 600, "retryable": "yes", "debug": "token=abc"}
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(403, json=upstream)))
    status, body = asyncio.run(b.forward("sources.list", user_token="t", path_params={}, body=None))
    assert status == 403
    assert set(body) == {"state", "message", "retryable"}
    assert body["state"] == "access_required" and body["retryable"] is True
    assert len(body["message"]) == 500 and "abc" not in str(body)


@pytest.mark.parametrize("state", ["ready", "loading", "pwned", 42, None])
def test_upstream_4xx_unknown_state_is_sanitized(configured, state):
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(403, json={"state": state, "message": "secret=abc"})))
    status, body = asyncio.run(b.forward("sources.list", user_token="t", path_params={}, body=None))
    assert status == 403 and body == {"detail": "forbidden"}


def test_workspace_id_is_normalized_to_canonical_uuid(configured):
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"id: 1\nevent: done\ndata: {}\n\n")

    wid = uuid.uuid4()
    b = ApplicationXBroker(transport=_transport(handler))

    async def collect(raw):
        return [c async for c in b.stream("workspace.events", user_token="t", path_params={"workspace_id": raw}, last_event_id=None)]

    for raw in (wid.hex, f"urn:uuid:{wid}", "{" + str(wid) + "}", str(wid).upper()):
        asyncio.run(collect(raw))
        assert seen["url"] == f"https://ax.example.test/v1/workspaces/{wid}/events", raw


def test_stream_passes_events_and_last_event_id(configured):
    seen = {}

    def handler(req):
        seen["lei"] = req.headers.get("last-event-id")
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"id: 1\nevent: status\ndata: {}\n\nid: 2\nevent: done\ndata: {}\n\n")

    b = ApplicationXBroker(transport=_transport(handler))

    async def collect():
        return b"".join([chunk async for chunk in b.stream("workspace.events", user_token="t", path_params={"workspace_id": str(uuid.uuid4())}, last_event_id="1")])

    out = asyncio.run(collect())
    assert b"event: done" in out and seen["lei"] == "1"


@pytest.mark.parametrize(
    ("cursor", "forwarded"),
    [
        ("1", "1"),
        ("cursor-7", "cursor-7"),
        ("evt_01J8:abc.def", "evt_01J8:abc.def"),
        ("a" * 64, "a" * 64),
        ("a" * 65, None),
        ("x y", None),
        ("a\r\nX-Injected: 1", None),
        ("", None),
        (None, None),
    ],
)
def test_stream_forwards_only_safe_opaque_cursors(configured, cursor, forwarded):
    seen = {}

    def handler(req):
        seen["lei"] = req.headers.get("last-event-id")
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"id: 1\nevent: done\ndata: {}\n\n")

    b = ApplicationXBroker(transport=_transport(handler))

    async def collect():
        return [c async for c in b.stream("workspace.events", user_token="t", path_params={"workspace_id": str(uuid.uuid4())}, last_event_id=cursor)]

    asyncio.run(collect())
    assert seen["lei"] == forwarded


def test_stream_stops_with_stream_timeout_after_max_seconds(configured, monkeypatch):
    monkeypatch.setattr(broker_module, "KEEPALIVE_SECONDS", 0.02)
    monkeypatch.setattr(settings, "APPLICATIONX_STREAM_MAX_SECONDS", 0.1)

    class NeverDone(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"id: 1\nevent: status\ndata: {}\n\n"
            await asyncio.sleep(10)
            yield b"id: 2\nevent: done\ndata: {}\n\n"  # pragma: no cover

    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=NeverDone())))

    async def collect():
        return [c async for c in b.stream("workspace.events", user_token="t", path_params={"workspace_id": str(uuid.uuid4())}, last_event_id=None)]

    import time as _time

    t0 = _time.monotonic()
    chunks = asyncio.run(collect())
    assert _time.monotonic() - t0 < 2
    assert chunks[0] == b"id: 1\nevent: status\ndata: {}\n\n"
    assert chunks[-1] == b'event: error\ndata: {"code": "stream_timeout"}\n\n'
    assert b"event: done" not in b"".join(chunks)


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
        async for chunk in b.stream("workspace.events", user_token="t", path_params={"workspace_id": str(uuid.uuid4())}, last_event_id=None):
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(collect())
    assert b": keepalive\n\n" in chunks
    assert b"".join(c for c in chunks if c != b": keepalive\n\n") == b"id: 1\nevent: status\ndata: {}\n\nid: 2\nevent: done\ndata: {}\n\n"


# --- Broker routes: trusted program enrichment + SSE proxy -----------------

from datetime import datetime, timezone  # noqa: E402
from app.models.program import Program, ProgramType, ProgramStatus  # noqa: E402
from app.services import applicationx_broker as mod  # noqa: E402


class _FakeBroker:
    def __init__(self):
        self.calls = []

    async def forward(self, operation, *, user_token, path_params, body):
        self.calls.append((operation, user_token, path_params, body))
        return 200, {
            "state": "ready",
            "workspace_id": "w",
            "workspace_title": "Nursing",
            "program_title": body.get("program_ref", {}).get("title") if body else None,
            "campus_label": "Main Campus",
            "revision_label": "r",
            "api_version": "0.1",
        }

    async def stream(self, operation, *, user_token, path_params, last_event_id):
        yield b"id: 1\nevent: done\ndata: {}\n\n"


@pytest.fixture
def fake_broker(monkeypatch):
    fb = _FakeBroker()
    monkeypatch.setattr("app.api.routes.applicationx.get_broker", lambda: fb)
    return fb


def test_resolve_enriches_program_from_database(as_faculty, configured, fake_broker, db_session, test_department, test_user_faculty):
    p = Program(title="Nursing AS", type=ProgramType.AS, department_id=test_department.id, created_by=test_user_faculty.id, status=ProgramStatus.APPROVED)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    r = as_faculty.post(
        "/api/applicationx/host-contexts/resolve",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
        json={"program_id": str(p.id), "workspace_id": None, "context_id": "ctx"},
    )
    assert r.status_code == 200 and r.json()["state"] == "ready"
    op, token, _, body = fake_broker.calls[0]
    assert op == "host-contexts.resolve" and token == "tok"
    assert body["organization_ref"] == "demo-college" and body["campus_ref"] == "MAIN" and body["host"] == "calricula"
    assert body["program_ref"]["external_id"] == str(p.id) and body["program_ref"]["title"] == "Nursing AS" and body["program_ref"]["status"] == "Approved"
    assert body["program_ref"]["revision"].endswith("+00:00")


def test_resolve_unknown_program_404_and_no_upstream_call(as_faculty, configured, fake_broker):
    r = as_faculty.post(
        "/api/applicationx/host-contexts/resolve",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
        json={"program_id": str(uuid.uuid4()), "workspace_id": None, "context_id": "ctx"},
    )
    assert r.status_code == 404 and fake_broker.calls == []


def test_ops_only_allowlisted(as_faculty, configured, fake_broker):
    assert as_faculty.post(
        "/api/applicationx/ops/host-contexts.resolve",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
        json={"path_params": {}, "body": {}},
    ).status_code == 404
    assert as_faculty.post(
        "/api/applicationx/ops/sources.list",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
        json={"path_params": {}, "body": None},
    ).status_code == 200


def test_disabled_embed_is_503_everywhere_but_status(as_faculty, fake_broker):
    assert as_faculty.post(
        "/api/applicationx/host-contexts/resolve",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
        json={"program_id": None, "workspace_id": None, "context_id": "c"},
    ).status_code == 503
    assert as_faculty.get("/api/applicationx/status").status_code == 200


def test_events_stream_proxied(as_faculty, configured, fake_broker):
    r = as_faculty.get(
        f"/api/applicationx/workspaces/{uuid.uuid4()}/events",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok", "Last-Event-ID": "0"},
    )
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream") and b"event: done" in r.content


def test_broker_error_never_echoes_token(as_faculty, configured, monkeypatch):
    class Boom:
        async def forward(self, *a, **k):
            raise mod.BrokerError(502, "upstream_error", "ApplicationX returned an error")

    monkeypatch.setattr("app.api.routes.applicationx.get_broker", lambda: Boom())
    r = as_faculty.post(
        "/api/applicationx/ops/sources.list",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "secret-token-xyz"},
        json={"path_params": {}, "body": None},
    )
    assert r.status_code == 502 and "secret-token-xyz" not in r.text and r.json()["detail"]["code"] == "upstream_error"


def test_missing_upstream_token_is_401(as_faculty, configured, fake_broker):
    r = as_faculty.post(
        "/api/applicationx/ops/sources.list",
        headers={"Authorization": "Bearer tok"},
        json={"path_params": {}, "body": None},
    )
    assert r.status_code == 401 and r.json()["detail"]["code"] == "missing_upstream_token"
    assert fake_broker.calls == []


def test_stream_broker_error_before_first_byte_surfaces_as_error_status(as_faculty, configured, monkeypatch):
    class BoomStream:
        async def stream(self, *a, **k):
            raise mod.BrokerError(403, "upstream_stream_error", "forbidden")
            yield b""  # pragma: no cover -- makes this an async generator

    monkeypatch.setattr("app.api.routes.applicationx.get_broker", lambda: BoomStream())
    r = as_faculty.get(
        f"/api/applicationx/workspaces/{uuid.uuid4()}/events",
        headers={"Authorization": "Bearer tok", "X-ApplicationX-Token": "tok"},
    )
    assert r.status_code == 403 and r.json()["detail"]["code"] == "upstream_stream_error"
