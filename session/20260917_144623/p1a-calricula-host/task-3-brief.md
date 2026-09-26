### Task 3: Broker routes with trusted program enrichment

**Files:**
- Modify: `backend/app/api/routes/applicationx.py`
- Test: `backend/tests/test_applicationx_broker.py` (third section)

**Interfaces:**
- `POST /api/applicationx/host-contexts/resolve` body `{program_id: uuid|null, workspace_id: uuid|null, context_id: str}` → the upstream `HostResolution` JSON. The route loads `Program` by id (404 if missing), builds `program_ref = {source_app: "calricula", external_id: str(program.id), revision: program.updated_at.replace(tzinfo=UTC).isoformat(), title: program.title, status: program.status.value}`, and sends `{host: "calricula", organization_ref, campus_ref, program_ref, workspace_id, context_id}` upstream. Browser-supplied program metadata is never accepted.
- `POST /api/applicationx/ops/{operation}` body `{path_params: dict, body: dict|null}` for `chat.messages`, `chat.cancel`, `sources.list`, `sources.health` → `(status, json)` from the broker; body size limited to 16 KB.
- `GET /api/applicationx/runs/{run_id}/events` → `StreamingResponse(text/event-stream)` proxied via `broker.stream`, honoring the incoming `Last-Event-ID`.
- The bearer token is read from the incoming `Authorization` header (the same one `get_current_user` validated); `BrokerError` → `HTTPException(status, {"code", "message"})`.
- Disabled embed (`settings.applicationx_ready` false) → 503 `{"code": "embed_disabled"}` on every route except `status`.

- [ ] **Step 1: Write the failing tests**

```python
from datetime import datetime, timezone
from app.models.program import Program, ProgramType, ProgramStatus
from app.services import applicationx_broker as mod

class _FakeBroker:
    def __init__(self): self.calls = []
    async def forward(self, operation, *, user_token, path_params, body):
        self.calls.append((operation, user_token, path_params, body)); return 200, {"state": "ready", "workspace_id": "w", "workspace_title": "Nursing", "program_title": body.get("program_ref", {}).get("title") if body else None, "campus_label": "LAMC", "revision_label": "r", "api_version": "0.1"}
    async def stream(self, operation, *, user_token, path_params, last_event_id):
        yield b"id: 1\nevent: done\ndata: {}\n\n"

@pytest.fixture
def fake_broker(monkeypatch):
    fb = _FakeBroker(); monkeypatch.setattr("app.api.routes.applicationx.get_broker", lambda: fb); return fb

def test_resolve_enriches_program_from_database(as_faculty, configured, fake_broker, db_session, test_department, test_user_faculty):
    p = Program(title="Nursing AS", type=ProgramType.AS, department_id=test_department.id, created_by=test_user_faculty.id, status=ProgramStatus.APPROVED)
    db_session.add(p); db_session.commit(); db_session.refresh(p)
    r = as_faculty.post("/api/applicationx/host-contexts/resolve", headers={"Authorization": "Bearer tok"}, json={"program_id": str(p.id), "workspace_id": None, "context_id": "ctx"})
    assert r.status_code == 200 and r.json()["state"] == "ready"
    op, token, _, body = fake_broker.calls[0]
    assert op == "host-contexts.resolve" and token == "tok"
    assert body["organization_ref"] == "lamc" and body["campus_ref"] == "LAMC" and body["host"] == "calricula"
    assert body["program_ref"]["external_id"] == str(p.id) and body["program_ref"]["title"] == "Nursing AS" and body["program_ref"]["status"] == "Approved"
    assert body["program_ref"]["revision"].endswith("+00:00")

def test_resolve_unknown_program_404_and_no_upstream_call(as_faculty, configured, fake_broker):
    r = as_faculty.post("/api/applicationx/host-contexts/resolve", headers={"Authorization": "Bearer tok"}, json={"program_id": str(uuid.uuid4()), "workspace_id": None, "context_id": "ctx"})
    assert r.status_code == 404 and fake_broker.calls == []

def test_ops_only_allowlisted(as_faculty, configured, fake_broker):
    assert as_faculty.post("/api/applicationx/ops/host-contexts.resolve", headers={"Authorization": "Bearer tok"}, json={"path_params": {}, "body": {}}).status_code == 404
    assert as_faculty.post("/api/applicationx/ops/chat.messages", headers={"Authorization": "Bearer tok"}, json={"path_params": {}, "body": {"question": "q", "context_id": "c", "conversation_id": None, "workspace_id": None, "language": "en"}}).status_code == 200

def test_disabled_embed_is_503_everywhere_but_status(as_faculty, fake_broker):
    assert as_faculty.post("/api/applicationx/host-contexts/resolve", headers={"Authorization": "Bearer tok"}, json={"program_id": None, "workspace_id": None, "context_id": "c"}).status_code == 503
    assert as_faculty.get("/api/applicationx/status").status_code == 200

def test_events_stream_proxied(as_faculty, configured, fake_broker):
    r = as_faculty.get(f"/api/applicationx/runs/{uuid.uuid4()}/events", headers={"Authorization": "Bearer tok", "Last-Event-ID": "0"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream") and b"event: done" in r.content

def test_broker_error_never_echoes_token(as_faculty, configured, monkeypatch):
    class Boom:
        async def forward(self, *a, **k): raise mod.BrokerError(502, "upstream_error", "ApplicationX returned an error")
    monkeypatch.setattr("app.api.routes.applicationx.get_broker", lambda: Boom())
    r = as_faculty.post("/api/applicationx/ops/sources.list", headers={"Authorization": "Bearer secret-token-xyz"}, json={"path_params": {}, "body": None})
    assert r.status_code == 502 and "secret-token-xyz" not in r.text and r.json()["detail"]["code"] == "upstream_error"
```
Reuse `db_session`, `test_department`, `test_user_faculty` fixtures from `tests/test_api_integration.py` by moving them into `tests/conftest.py` if they are not already there (they are re-declared locally at `test_api_integration.py:40-60`; lift them without changing behavior).

- [ ] **Step 2: Run** → 404s

- [ ] **Step 3: Implement** — extend `applicationx.py`:

```python
import uuid
from datetime import timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session
from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.program import Program
from app.models.user import User
from app.services.applicationx_broker import ApplicationXBroker, BrokerError, OPERATIONS

_broker: ApplicationXBroker | None = None
def get_broker() -> ApplicationXBroker:
    global _broker
    if _broker is None:
        _broker = ApplicationXBroker()
    return _broker

def _require_ready() -> None:
    if not settings.applicationx_ready:
        raise HTTPException(503, {"code": "embed_disabled", "message": "ApplicationX embed is not enabled"})

def _token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, {"code": "missing_token", "message": "Authorization required"})
    return authorization.split(" ", 1)[1].strip()

def _raise(e: BrokerError) -> None:
    raise HTTPException(e.status, {"code": e.code, "message": e.safe_message})

class ResolveIn(BaseModel):
    program_id: uuid.UUID | None
    workspace_id: uuid.UUID | None
    context_id: str

@router.post("/host-contexts/resolve")
async def resolve(body: ResolveIn, current_user: User = Depends(get_current_user), session: Session = Depends(get_session), authorization: str | None = Header(default=None)):
    _require_ready(); token = _token(authorization)
    program_ref = None
    if body.program_id is not None:
        program = session.get(Program, body.program_id)
        if program is None:
            raise HTTPException(404, {"code": "program_not_found", "message": "Program not found"})
        program_ref = {"source_app": "calricula", "external_id": str(program.id), "revision": program.updated_at.replace(tzinfo=timezone.utc).isoformat(),
                       "title": program.title, "status": program.status.value}
    upstream = {"host": "calricula", "organization_ref": settings.APPLICATIONX_ORGANIZATION_REF, "campus_ref": settings.APPLICATIONX_CAMPUS_REF,
                "program_ref": program_ref, "workspace_id": str(body.workspace_id) if body.workspace_id else None, "context_id": body.context_id[:128]}
    try:
        status_code, data = await get_broker().forward("host-contexts.resolve", user_token=token, path_params={}, body=upstream)
    except BrokerError as e:
        _raise(e)
    return data if status_code < 400 else HTTPException(status_code, data)  # typed states are 200 upstream; 401 → session_expired handled client-side

class OpIn(BaseModel):
    path_params: dict[str, str] = {}
    body: dict | None = None

@router.post("/ops/{operation}")
async def op(operation: str, payload: OpIn, request: Request, current_user: User = Depends(get_current_user), authorization: str | None = Header(default=None)):
    _require_ready(); token = _token(authorization)
    if operation not in OPERATIONS or operation == "host-contexts.resolve":
        raise HTTPException(404, {"code": "unknown_operation", "message": "unknown operation"})
    if int(request.headers.get("content-length") or 0) > 16 * 1024:
        raise HTTPException(413, {"code": "too_large", "message": "request too large"})
    try:
        status_code, data = await get_broker().forward(operation, user_token=token, path_params=payload.path_params, body=payload.body)
    except BrokerError as e:
        _raise(e)
    if status_code >= 400:
        raise HTTPException(status_code, data)
    return data

@router.get("/runs/{run_id}/events")
async def run_events(run_id: uuid.UUID, current_user: User = Depends(get_current_user), authorization: str | None = Header(default=None), last_event_id: str | None = Header(default=None)):
    _require_ready(); token = _token(authorization)
    gen = get_broker().stream("chat.events", user_token=token, path_params={"run_id": str(run_id)}, last_event_id=last_event_id)
    return StreamingResponse(gen, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```
Fix the `resolve` return: when `status_code >= 400` raise `HTTPException(status_code, data)`; otherwise return `data`.

- [ ] **Step 4: Run the whole backend suite** — `cd backend && pytest` → green, coverage ≥ 45%

- [ ] **Step 5: Commit** — `feat(applicationx): broker routes with trusted program enrichment and SSE proxy`.

---

