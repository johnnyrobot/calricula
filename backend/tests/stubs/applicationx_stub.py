"""
ApplicationX stub upstream for local development and the Playwright
acceptance spec (frontend/e2e/applicationx-embed.spec.ts).

Implements just enough of the ApplicationX host API for the Calricula broker
(app/services/applicationx_broker.py) to exercise every host state:

    POST /v1/host-contexts/resolve   ready | mapping_required | access_required
    POST /v1/chat/messages           202 with run, conversation and message ids
    GET  /v1/chat/runs/{id}/events   SSE: status, answer (one citation), done;
                                     each payload carries the turn's context_id
    POST /v1/chat/runs/{id}/cancel   200 {run_id, status: cancelled}
    GET  /v1/sources                 a single source

Behaviour is driven by environment variables:

    STUB_MAPPED   comma-separated program uuids that resolve to `ready`
                  (`SELECT id FROM programs WHERE title='Computer Science'`).
                  Everything else answers `mapping_required`.
    STUB_DOWN=1   every route answers 503 (outage, EMBEDDED case 9).

The forwarded bearer decides access: `dev-articulation-001` (the dev-mode
token for articulation@calricula.com) gets `access_required`; any other
non-empty bearer is accepted. In dev mode the broker forwards a `dev-*`
token; in production it forwards the Logto access token Calricula obtains
via `getToken('applicationx')` (audience LOGTO_APPLICATIONX_RESOURCE,
ADR-0001) -- the stub does not verify signatures.

Run from `backend/`:

    STUB_MAPPED=<program uuid> uvicorn tests.stubs.applicationx_stub:app --port 8099

This module is not a test; pytest collects `test_*.py` only.
"""

import asyncio
import json
import os
import uuid
from typing import AsyncIterator

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI(title="ApplicationX stub", docs_url=None, redoc_url=None)

ACCESS_DENIED_BEARERS = {"dev-articulation-001"}
API_VERSION = "1.0.0"


def _mapped() -> set[str]:
    return {p.strip() for p in os.environ.get("STUB_MAPPED", "").split(",") if p.strip()}


def _down() -> bool:
    return os.environ.get("STUB_DOWN", "") not in ("", "0", "false")


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        return ""
    return authorization[7:].strip()


@app.middleware("http")
async def outage(request: Request, call_next):
    if _down():
        return JSONResponse({"detail": "stub outage (STUB_DOWN=1)"}, status_code=503)
    return await call_next(request)


@app.post("/v1/host-contexts/resolve")
async def resolve(request: Request, authorization: str | None = Header(default=None)):
    token = _bearer(authorization)
    if not token:
        return JSONResponse({"detail": "missing bearer"}, status_code=401)
    if token in ACCESS_DENIED_BEARERS:
        return JSONResponse(
            {
                "state": "access_required",
                "message": "Ask your ApplicationX administrator to add you to the lamc organization.",
                "retryable": False,
            },
            # Host states are resolution outcomes, not transport errors: the
            # Calricula client reads `state` from 2xx bodies only.
            status_code=200,
        )
    body = await request.json()
    program_ref = body.get("program_ref") or None
    external_id = (program_ref or {}).get("external_id")
    if not program_ref or external_id not in _mapped():
        return JSONResponse(
            {
                "state": "mapping_required",
                "message": "This program is not mapped to an ApplicationX workspace.",
                "retryable": False,
            },
            status_code=200,
        )
    return {
        "state": "ready",
        "workspace_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"stub:{external_id}")),
        "workspace_title": f"{program_ref.get('title') or 'Program'} workspace",
        "program_title": program_ref.get("title"),
        "campus_label": body.get("campus_ref") or "LAMC",
        "revision_label": f"Revision {str(program_ref.get('revision', ''))[:10]}",
        "api_version": API_VERSION,
    }


# run_id -> context_id of the turn that started it. Every event payload
# carries `context_id`: the shared workspace shell (useChat) drops frames
# tagged with another context, and frames without one are "another context".
_RUN_CONTEXTS: dict[str, str] = {}


@app.post("/v1/chat/messages", status_code=202)
async def messages(request: Request):
    body = await request.json()
    run_id = str(uuid.uuid4())
    context_id = str(body.get("context_id") or "")
    _RUN_CONTEXTS[run_id] = context_id
    return {
        "run_id": run_id,
        "accepted": True,
        "context_id": context_id,
        "conversation_id": str(body.get("conversation_id") or uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
    }


def _events(run_id: str) -> list[tuple[int, str, dict]]:
    context_id = _RUN_CONTEXTS.get(run_id, "")
    return [
        (1, "status", {"run_id": run_id, "context_id": context_id, "status": "thinking"}),
        (
            2,
            "answer",
            {
                "message_id": str(uuid.uuid4()),
                "answer": "MULTIMD 100 has 6 open seats this term.",
                "route": "sections",
                "resolved_scope": {"campus": "LAMC"},
                "cards": [],
                "citations": [
                    {
                        "evidence_id": "ev-stub-1",
                        "url": "https://example.edu/schedule/MULTIMD-100",
                        "locator": "Schedule of classes",
                        "source_period": "2026FA",
                        "observed_at": "2026-09-19T00:00:00Z",
                    }
                ],
                "warnings": [],
                "clarification": None,
                "completeness": "complete",
                "run_id": run_id,
                "context_id": context_id,
            },
        ),
        (3, "done", {"run_id": run_id, "context_id": context_id, "status": "answer ready"}),
    ]


async def _stream(run_id: str, after: int) -> AsyncIterator[bytes]:
    for event_id, name, data in _events(run_id):
        if event_id <= after:
            continue
        yield f"id: {event_id}\nevent: {name}\ndata: {json.dumps(data)}\n\n".encode()
        await asyncio.sleep(0.05)


@app.get("/v1/chat/runs/{run_id}/events")
async def events(run_id: str, last_event_id: str | None = Header(default=None, alias="Last-Event-ID")):
    after = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0
    return StreamingResponse(
        _stream(run_id, after),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@app.post("/v1/chat/runs/{run_id}/cancel")
async def cancel(run_id: str):
    # A JSON body, not 204: the broker parses every upstream reply as JSON.
    return {"run_id": run_id, "status": "cancelled"}


@app.get("/v1/sources")
async def sources():
    return {
        "sources": [
            {"id": "schedule", "title": "Schedule of classes", "health": "ok", "observed_at": "2026-09-19T00:00:00Z"}
        ]
    }


@app.get("/v1/sources/{source_id}/health")
async def source_health(source_id: str):
    return {"id": source_id, "health": "ok", "observed_at": "2026-09-19T00:00:00Z"}
