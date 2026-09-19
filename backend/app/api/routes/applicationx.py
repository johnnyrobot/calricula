"""
ApplicationX broker routes.

Exposes the deployment's ApplicationX (companion staff workspace) embed
configuration to authenticated Calricula users, and forwards allowlisted
operations to the companion service via ApplicationXBroker.

Token transport: the `Authorization` header carries the Calricula session
token that `get_current_user` validates -- it is never forwarded upstream.
The token forwarded to ApplicationX is the browser's own Logto access token
for the ApplicationX resource, carried in a separate `X-ApplicationX-Token`
header.
"""

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

router = APIRouter()


class StatusOut(BaseModel):
    enabled: bool
    organization_ref: str | None
    campus_ref: str | None
    standalone_url: str | None
    api_version: str | None


@router.get("/status", response_model=StatusOut)
async def status(current_user: User = Depends(get_current_user)) -> StatusOut:
    if not settings.applicationx_ready:
        return StatusOut(
            enabled=False,
            organization_ref=None,
            campus_ref=None,
            standalone_url=None,
            api_version=None,
        )
    return StatusOut(
        enabled=True,
        organization_ref=settings.APPLICATIONX_ORGANIZATION_REF,
        campus_ref=settings.APPLICATIONX_CAMPUS_REF,
        standalone_url=settings.APPLICATIONX_STANDALONE_URL,
        api_version=None,
    )


_broker: ApplicationXBroker | None = None


def get_broker() -> ApplicationXBroker:
    global _broker
    if _broker is None:
        _broker = ApplicationXBroker()
    return _broker


def _require_ready() -> None:
    if not settings.applicationx_ready:
        raise HTTPException(503, {"code": "embed_disabled", "message": "ApplicationX embed is not enabled"})


def _upstream_token(x_applicationx_token: str | None = Header(default=None, alias="X-ApplicationX-Token")) -> str:
    if not x_applicationx_token or not x_applicationx_token.strip():
        raise HTTPException(401, {"code": "missing_upstream_token", "message": "ApplicationX token required"})
    return x_applicationx_token.strip()


def _raise(e: BrokerError) -> None:
    raise HTTPException(e.status, {"code": e.code, "message": e.safe_message})


class ResolveIn(BaseModel):
    program_id: uuid.UUID | None
    workspace_id: uuid.UUID | None
    context_id: str


@router.post("/host-contexts/resolve")
async def resolve(
    body: ResolveIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    token: str = Depends(_upstream_token),
):
    _require_ready()
    program_ref = None
    if body.program_id is not None:
        program = session.get(Program, body.program_id)
        if program is None:
            raise HTTPException(404, {"code": "program_not_found", "message": "Program not found"})
        program_ref = {
            "source_app": "calricula",
            "external_id": str(program.id),
            "revision": program.updated_at.replace(tzinfo=timezone.utc).isoformat(),
            "title": program.title,
            "status": program.status.value,
        }
    upstream = {
        "host": "calricula",
        "organization_ref": settings.APPLICATIONX_ORGANIZATION_REF,
        "campus_ref": settings.APPLICATIONX_CAMPUS_REF,
        "program_ref": program_ref,
        "workspace_id": str(body.workspace_id) if body.workspace_id else None,
        "context_id": body.context_id[:128],
    }
    try:
        status_code, data = await get_broker().forward(
            "host-contexts.resolve", user_token=token, path_params={}, body=upstream
        )
    except BrokerError as e:
        _raise(e)
    if status_code >= 400:
        raise HTTPException(status_code, data)
    return data


class OpIn(BaseModel):
    path_params: dict[str, str] = {}
    body: dict | None = None


@router.post("/ops/{operation}")
async def op(
    operation: str,
    payload: OpIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    token: str = Depends(_upstream_token),
):
    _require_ready()
    if operation not in OPERATIONS or operation == "host-contexts.resolve":
        raise HTTPException(404, {"code": "unknown_operation", "message": "unknown operation"})
    if int(request.headers.get("content-length") or 0) > 16 * 1024:
        raise HTTPException(413, {"code": "too_large", "message": "request too large"})
    try:
        status_code, data = await get_broker().forward(
            operation, user_token=token, path_params=payload.path_params, body=payload.body
        )
    except BrokerError as e:
        _raise(e)
    if status_code >= 400:
        raise HTTPException(status_code, data)
    return data


async def _chain(first, gen):
    try:
        if first is not None:
            yield first
        async for chunk in gen:
            yield chunk
    finally:
        await gen.aclose()


@router.get("/runs/{run_id}/events")
async def run_events(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    token: str = Depends(_upstream_token),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    _require_ready()
    broker = get_broker()
    gen = broker.stream(
        "chat.events", user_token=token, path_params={"run_id": str(run_id)}, last_event_id=last_event_id
    )
    try:
        first = await gen.__anext__()
    except BrokerError as e:
        _raise(e)
    except StopAsyncIteration:
        first = None
    return StreamingResponse(
        _chain(first, gen),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
