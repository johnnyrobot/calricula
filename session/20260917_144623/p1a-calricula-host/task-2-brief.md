### Task 2: Broker service — allowlisted forwarding, redaction, SSE passthrough

**Files:**
- Create: `backend/app/services/applicationx_broker.py`
- Test: `backend/tests/test_applicationx_broker.py` (second section)

**Interfaces:**
- `OPERATIONS: dict[str, tuple[str, str]] = {"host-contexts.resolve": ("POST", "/v1/host-contexts/resolve"), "chat.messages": ("POST", "/v1/chat/messages"), "chat.cancel": ("POST", "/v1/chat/runs/{run_id}/cancel"), "sources.list": ("GET", "/v1/sources"), "sources.health": ("GET", "/v1/sources/{source_id}/health")}`; streams: `"chat.events": ("GET", "/v1/chat/runs/{run_id}/events")`.
- `class BrokerError(Exception)`: `status: int` (502 upstream failure, 504 timeout, 404 unknown op, 400 bad path param), `code: str`, `safe_message: str`.
- `class ApplicationXBroker`: `__init__(transport: httpx.AsyncBaseTransport|None = None)`; `async forward(operation: str, *, user_token: str, path_params: dict[str,str], body: dict|None) -> tuple[int, dict]` returns upstream status and JSON for 2xx/4xx (4xx bodies are replaced by `{"detail": <safe code>}` unless the upstream returned the typed `state` contract); `async stream(operation, *, user_token, path_params, last_event_id) -> AsyncIterator[bytes]` yields raw SSE bytes with a 15 s idle keepalive and closes on client disconnect.
- Headers sent upstream: `Authorization: Bearer <user_token>`, `Accept`, `Content-Type`, `X-Calricula-Host: calricula`, `X-Calricula-Service: <APPLICATIONX_SERVICE_TOKEN>` when configured, and `Last-Event-ID` for streams. Nothing else.
- Path params are validated: `run_id` must be a UUID, `source_id` must match `^[a-z_]{2,40}$`.

- [ ] **Step 1: Write the failing tests**

```python
import asyncio, json, uuid
import httpx
from app.services.applicationx_broker import ApplicationXBroker, BrokerError

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
            asyncio.run(b.forward(op, user_token="t", path_params=params, body=None)); assert False, op
        except BrokerError as e:
            assert e.status == code

def test_upstream_5xx_and_timeout_become_typed_errors_without_leaking_body(configured):
    b = ApplicationXBroker(transport=_transport(lambda r: httpx.Response(500, text="secret stack trace token=abc")))
    try:
        asyncio.run(b.forward("sources.list", user_token="t", path_params={}, body=None)); assert False
    except BrokerError as e:
        assert e.status == 502 and "abc" not in e.safe_message and "trace" not in e.safe_message
    def slow(req): raise httpx.ReadTimeout("slow")
    try:
        asyncio.run(ApplicationXBroker(transport=_transport(slow)).forward("sources.list", user_token="t", path_params={}, body=None)); assert False
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
```

- [ ] **Step 2: Run** → `ModuleNotFoundError: app.services.applicationx_broker`

- [ ] **Step 3: Implement**

```python
import re, uuid
from typing import AsyncIterator
import httpx
from app.core.config import settings

OPERATIONS: dict[str, tuple[str, str]] = {
    "host-contexts.resolve": ("POST", "/v1/host-contexts/resolve"),
    "chat.messages": ("POST", "/v1/chat/messages"),
    "chat.cancel": ("POST", "/v1/chat/runs/{run_id}/cancel"),
    "sources.list": ("GET", "/v1/sources"),
    "sources.health": ("GET", "/v1/sources/{source_id}/health"),
}
STREAMS: dict[str, tuple[str, str]] = {"chat.events": ("GET", "/v1/chat/runs/{run_id}/events")}
_PARAM_RULES = {"run_id": lambda v: bool(uuid.UUID(v)), "source_id": lambda v: re.fullmatch(r"[a-z_]{2,40}", v) is not None}
_SAFE_4XX = {400: "invalid request", 401: "session expired", 403: "forbidden", 404: "not found", 409: "conflict", 413: "too large", 429: "rate limited"}

class BrokerError(Exception):
    def __init__(self, status: int, code: str, safe_message: str) -> None:
        super().__init__(safe_message); self.status, self.code, self.safe_message = status, code, safe_message

def _path(template: str, params: dict[str, str]) -> str:
    out = template
    for name in re.findall(r"{(\w+)}", template):
        value = params.get(name, "")
        try:
            ok = _PARAM_RULES[name](value)
        except Exception:
            ok = False
        if not ok:
            raise BrokerError(400, "bad_path_param", f"invalid {name}")
        out = out.replace("{" + name + "}", value)
    return out

class ApplicationXBroker:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    def _headers(self, user_token: str, extra: dict[str, str] | None = None) -> dict[str, str]:
        h = {"Authorization": f"Bearer {user_token}", "Accept": "application/json", "X-Calricula-Host": "calricula"}
        if settings.APPLICATIONX_SERVICE_TOKEN:
            h["X-Calricula-Service"] = settings.APPLICATIONX_SERVICE_TOKEN
        h.update(extra or {})
        return h

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=settings.APPLICATIONX_API_ORIGIN or "", transport=self._transport,
                                 timeout=timeout or settings.APPLICATIONX_TIMEOUT_SECONDS, follow_redirects=False)

    async def forward(self, operation: str, *, user_token: str, path_params: dict[str, str], body: dict | None) -> tuple[int, dict]:
        if operation not in OPERATIONS:
            raise BrokerError(404, "unknown_operation", "unknown operation")
        method, template = OPERATIONS[operation]
        path = _path(template, path_params)
        try:
            async with self._client() as client:
                resp = await client.request(method, path, headers=self._headers(user_token), json=body if method == "POST" else None)
        except httpx.TimeoutException:
            raise BrokerError(504, "upstream_timeout", "ApplicationX did not answer in time")
        except httpx.HTTPError:
            raise BrokerError(502, "upstream_unavailable", "ApplicationX is unavailable")
        if resp.status_code >= 500:
            raise BrokerError(502, "upstream_error", "ApplicationX returned an error")
        try:
            data = resp.json()
        except ValueError:
            raise BrokerError(502, "upstream_invalid", "ApplicationX returned an invalid response")
        if resp.status_code >= 400:
            if isinstance(data, dict) and "state" in data:
                return resp.status_code, data
            return resp.status_code, {"detail": _SAFE_4XX.get(resp.status_code, "request rejected")}
        return resp.status_code, data

    async def stream(self, operation: str, *, user_token: str, path_params: dict[str, str], last_event_id: str | None) -> AsyncIterator[bytes]:
        if operation not in STREAMS:
            raise BrokerError(404, "unknown_operation", "unknown operation")
        method, template = STREAMS[operation]
        path = _path(template, path_params)
        extra = {"Accept": "text/event-stream"}
        if last_event_id and last_event_id.isdigit():
            extra["Last-Event-ID"] = last_event_id
        try:
            async with self._client(timeout=httpx.Timeout(settings.APPLICATIONX_TIMEOUT_SECONDS, read=None)) as client:
                async with client.stream(method, path, headers=self._headers(user_token, extra)) as resp:
                    if resp.status_code >= 400:
                        raise BrokerError(502 if resp.status_code >= 500 else resp.status_code, "upstream_stream_error", _SAFE_4XX.get(resp.status_code, "stream rejected"))
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        except httpx.TimeoutException:
            yield b"event: error\ndata: {\"code\": \"upstream_timeout\"}\n\n"
        except httpx.HTTPError:
            yield b"event: error\ndata: {\"code\": \"upstream_unavailable\"}\n\n"
```

- [ ] **Step 4: Run tests** → 9 passed (both sections)

- [ ] **Step 5: Commit** — `feat(applicationx): scoped broker service with allowlist, sanitized errors and SSE passthrough`.

---

