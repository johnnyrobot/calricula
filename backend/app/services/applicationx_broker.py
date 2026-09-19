"""
ApplicationX broker service.

Forwards an allowlisted set of operations to the ApplicationX companion
service over httpx, using the caller's own bearer token (never expanding
scope), validating path parameters, sanitizing upstream error bodies, and
passing through Server-Sent Events with an idle keepalive.
"""

import asyncio
import re
import uuid
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
STREAMS: dict[str, tuple[str, str]] = {
    "chat.events": ("GET", "/v1/chat/runs/{run_id}/events"),
}

# How long to wait for the next SSE chunk before emitting a keepalive comment
# to hold the connection open through intermediate proxies.
KEEPALIVE_SECONDS = 15.0

_PARAM_RULES = {
    "run_id": lambda v: _is_uuid(v),
    "source_id": lambda v: re.fullmatch(r"[a-z_]{2,40}", v) is not None,
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
        out = out.replace("{" + name + "}", value)
    return out


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
            if isinstance(data, dict) and "state" in data:
                return resp.status_code, data
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
        if last_event_id and last_event_id.isdigit():
            extra["Last-Event-ID"] = last_event_id

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
                            done, _ = await asyncio.wait({pending}, timeout=KEEPALIVE_SECONDS)
                            if pending not in done:
                                yield b": keepalive\n\n"
                                continue
                            try:
                                chunk = pending.result()
                            except StopAsyncIteration:
                                break
                            yield chunk
                            pending = asyncio.ensure_future(body_iter.__anext__())
                    finally:
                        pending.cancel()
        except httpx.TimeoutException:
            yield b'event: error\ndata: {"code": "upstream_timeout"}\n\n'
        except httpx.HTTPError:
            yield b'event: error\ndata: {"code": "upstream_unavailable"}\n\n'
