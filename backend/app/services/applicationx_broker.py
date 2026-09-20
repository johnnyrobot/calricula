"""
ApplicationX broker service.

Forwards an allowlisted set of operations to the ApplicationX companion
service over httpx, using the caller's own bearer token (never expanding
scope), validating path parameters, sanitizing upstream error bodies, and
passing through Server-Sent Events with an idle keepalive.
"""

import asyncio
import re
import time
import uuid
from typing import AsyncIterator

import httpx

from app.core.config import settings

OPERATIONS: dict[str, tuple[str, str]] = {
    "host-contexts.resolve": ("POST", "/v1/host-contexts/resolve"),
    "sources.list": ("GET", "/v1/sources"),
    "sources.health": ("GET", "/v1/sources/{source_id}/health"),
}
# Workspace event streams (threads, tasks, evidence) arrive with ApplicationX
# P2; the relay below is already proven against them.
STREAMS: dict[str, tuple[str, str]] = {
    "workspace.events": ("GET", "/v1/workspaces/{workspace_id}/events"),
}

# How long to wait for the next SSE chunk before emitting a keepalive comment
# to hold the connection open through intermediate proxies.
KEEPALIVE_SECONDS = 15.0

# Host failure states the upstream may return in a typed 4xx body. Anything
# else (including `ready`/`loading`, which are not failures) is sanitized.
HOST_FAILURE_STATES = frozenset(
    {
        "access_required",
        "mapping_required",
        "context_stale",
        "session_expired",
        "service_unavailable",
        "version_mismatch",
    }
)
_MESSAGE_MAX = 500

# SSE event ids are opaque cursors; only forward `Last-Event-ID` values from a
# conservative charset so nothing header-injectable crosses the boundary.
_EVENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")

_PARAM_RULES = {
    "workspace_id": lambda v: _is_uuid(v),
    "source_id": lambda v: re.fullmatch(r"[a-z_]{2,40}", v) is not None,
}
# Canonical form substituted into the upstream path (after validation).
_PARAM_NORMALIZE = {
    "workspace_id": lambda v: str(uuid.UUID(v)),
}
_SAFE_4XX = {
    400: "invalid request",
    401: "session expired",
    403: "forbidden",
    404: "not found",
    409: "conflict",
    413: "too large",
    429: "rate limited",
}


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class BrokerError(Exception):
    """Typed broker failure. `safe_message` is safe to return to the client."""

    def __init__(self, status: int, code: str, safe_message: str) -> None:
        super().__init__(safe_message)
        self.status = status
        self.code = code
        self.safe_message = safe_message


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
        normalize = _PARAM_NORMALIZE.get(name)
        out = out.replace("{" + name + "}", normalize(value) if normalize else value)
    return out


def _typed_failure(data: object) -> dict | None:
    """Return the `{state, message, retryable}` allowlist projection of an
    upstream 4xx body when `state` is a known host failure; else None."""
    if not isinstance(data, dict):
        return None
    state = data.get("state")
    if not isinstance(state, str) or state not in HOST_FAILURE_STATES:
        return None
    message = data.get("message")
    message = "" if message is None else str(message)[:_MESSAGE_MAX]
    return {"state": state, "message": message, "retryable": bool(data.get("retryable", False))}


class ApplicationXBroker:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    def _headers(self, user_token: str, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {user_token}",
            "Accept": "application/json",
            "X-Calricula-Host": "calricula",
        }
        if settings.APPLICATIONX_SERVICE_TOKEN:
            headers["X-Calricula-Service"] = settings.APPLICATIONX_SERVICE_TOKEN
        headers.update(extra or {})
        return headers

    def _client(self, timeout: httpx.Timeout | float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=settings.APPLICATIONX_API_ORIGIN or "",
            transport=self._transport,
            timeout=timeout if timeout is not None else settings.APPLICATIONX_TIMEOUT_SECONDS,
            follow_redirects=False,
        )

    async def forward(
        self,
        operation: str,
        *,
        user_token: str,
        path_params: dict[str, str],
        body: dict | None,
    ) -> tuple[int, dict]:
        if operation not in OPERATIONS:
            raise BrokerError(404, "unknown_operation", "unknown operation")
        method, template = OPERATIONS[operation]
        path = _path(template, path_params)
        try:
            async with self._client() as client:
                resp = await client.request(
                    method,
                    path,
                    headers=self._headers(user_token),
                    json=body if method == "POST" else None,
                )
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
            typed = _typed_failure(data)
            if typed is not None:
                return resp.status_code, typed
            return resp.status_code, {"detail": _SAFE_4XX.get(resp.status_code, "request rejected")}

        return resp.status_code, data

    async def stream(
        self,
        operation: str,
        *,
        user_token: str,
        path_params: dict[str, str],
        last_event_id: str | None,
    ) -> AsyncIterator[bytes]:
        if operation not in STREAMS:
            raise BrokerError(404, "unknown_operation", "unknown operation")
        method, template = STREAMS[operation]
        path = _path(template, path_params)
        extra = {"Accept": "text/event-stream"}
        if last_event_id and _EVENT_ID_RE.match(last_event_id):
            extra["Last-Event-ID"] = last_event_id
        max_seconds = settings.APPLICATIONX_STREAM_MAX_SECONDS
        started = time.monotonic()

        try:
            async with self._client(timeout=httpx.Timeout(settings.APPLICATIONX_TIMEOUT_SECONDS, read=None)) as client:
                async with client.stream(method, path, headers=self._headers(user_token, extra)) as resp:
                    if resp.status_code >= 400:
                        raise BrokerError(
                            502 if resp.status_code >= 500 else resp.status_code,
                            "upstream_stream_error",
                            _SAFE_4XX.get(resp.status_code, "stream rejected"),
                        )
                    body_iter = resp.aiter_bytes().__aiter__()
                    # Wait on the *same* pending __anext__() task across idle
                    # ticks rather than re-issuing/cancelling it each time --
                    # cancelling a suspended async generator's __anext__()
                    # closes the generator, so a naive asyncio.wait_for retry
                    # loop would silently truncate the stream after the first
                    # keepalive.
                    pending = asyncio.ensure_future(body_iter.__anext__())
                    try:
                        while True:
                            remaining = max_seconds - (time.monotonic() - started)
                            if remaining <= 0:
                                yield b'event: error\ndata: {"code": "stream_timeout"}\n\n'
                                break
                            done, _ = await asyncio.wait({pending}, timeout=min(KEEPALIVE_SECONDS, remaining))
                            if pending not in done:
                                if time.monotonic() - started >= max_seconds:
                                    yield b'event: error\ndata: {"code": "stream_timeout"}\n\n'
                                    break
                                yield b": keepalive\n\n"
                                continue
                            try:
                                chunk = pending.result()
                            except StopAsyncIteration:
                                break
                            yield chunk
                            pending = asyncio.ensure_future(body_iter.__anext__())
                    finally:
                        # Let the cancelled __anext__() task settle before the
                        # response/stream is closed underneath it.
                        pending.cancel()
                        await asyncio.gather(pending, return_exceptions=True)
        except httpx.TimeoutException:
            yield b'event: error\ndata: {"code": "upstream_timeout"}\n\n'
        except httpx.HTTPError:
            yield b'event: error\ndata: {"code": "upstream_unavailable"}\n\n'
