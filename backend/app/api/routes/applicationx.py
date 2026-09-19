"""
ApplicationX broker routes.

Exposes the deployment's ApplicationX (companion staff workspace) embed
configuration to authenticated Calricula users, and forwards allowlisted
operations to the companion service (routes added in a later task).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

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
