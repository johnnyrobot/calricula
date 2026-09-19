"""
Authentication API Routes

Provides endpoints for:
- POST /api/auth/login - Verify an OIDC ID token and return the user profile
- GET /api/auth/me - Get current user's profile
- POST /api/auth/logout - Logout (client-side only, for logging purposes)
"""

from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import ConfigDict, BaseModel, computed_field
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import (
    get_current_user,
    is_provisional_email,
    provisioning_email,
    provisioning_name,
)
from app.core.oidc import AuthError, resolve_dev_token, verify_bearer, verify_id_token
from app.models.user import User, UserRole
from app.models.department import Department

router = APIRouter()
security = HTTPBearer(auto_error=False)


# =============================================================================
# Response Schemas
# =============================================================================

class DepartmentInfo(BaseModel):
    """Department information in user profile."""
    id: uuid.UUID
    name: str
    code: str


class UserProfileResponse(BaseModel):
    """User profile response schema."""
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    auth_subject: str
    department_id: Optional[uuid.UUID] = None
    department: Optional[DepartmentInfo] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def firebase_uid(self) -> str:
        """DEPRECATED read-only alias for `auth_subject`, kept for one release
        so a client built against the pre-ADR-0001 response keeps working.
        Remove once the frontend reads `auth_subject`."""
        return self.auth_subject


class LoginResponse(BaseModel):
    """Login response with user profile."""
    message: str
    user: UserProfileResponse


class LogoutResponse(BaseModel):
    """Logout response."""
    message: str


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_profile(user: User, session: Session) -> UserProfileResponse:
    """
    Build a UserProfileResponse from a User object,
    including department information if available.
    """
    department_info = None

    if user.department_id:
        statement = select(Department).where(Department.id == user.department_id)
        department = session.exec(statement).first()
        if department:
            department_info = DepartmentInfo(
                id=department.id,
                name=department.name,
                code=department.code,
            )

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        auth_subject=user.auth_subject,
        department_id=user.department_id,
        department=department_info,
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/login", response_model=LoginResponse)
async def login(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
):
    """
    Verify an OIDC ID token and return the user profile.

    This endpoint:
    1. Accepts the provider's **ID token** in the Authorization header -- this
       is the only route that does. ID tokens are audienced to the web app and
       are the only tokens carrying `email`/`name`; every other route requires
       an access token audienced to this API.
    2. Verifies it (app/core/oidc.py), or resolves a documented dev-* token
       when AUTH_DEV_MODE is on
    3. Links the token's subject to a user: by `auth_subject`, or once by
       verified-email match against a pre-migration row (`auth_issuer` NULL)
    4. Provisions a FACULTY user if neither matched, then returns the profile
       with role and department info

    The frontend should call this after a successful sign-in to get the user's
    app-specific profile data.

    **Authorization:** Bearer token (OIDC ID token)

    **Returns:**
    - 200: User profile on successful authentication
    - 401: Invalid or missing token
    - 403: Demo mode is on and the account is not a demo account
    - 503: No provider configured (fails closed)
    """
    # Check if credentials were provided
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract and verify the token. Dev tokens are resolved first so the dev
    # bypass works with no provider configured, exactly as for API calls.
    token = credentials.credentials
    claims = resolve_dev_token(token)

    if claims is None:
        try:
            claims = verify_id_token(token)
        except AuthError as e:
            raise HTTPException(
                status_code=e.status,
                detail=e.detail,
                headers={"WWW-Authenticate": "Bearer"},
            )

    subject = claims.get("sub")

    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = claims.get("email")
    email_verified = bool(claims.get("email_verified"))
    issuer = claims.get("iss")

    # Demo mode: a public demo deployment only admits demo accounts. This is
    # the only gate -- get_current_user refuses to provision in demo mode so it
    # cannot be walked around by calling a protected route directly.
    if settings.DEMO_MODE and "demo" not in (email or "").lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo mode only allows access to users with 'demo' in their email address",
        )

    # 1. Already linked to this subject.
    user = session.exec(select(User).where(User.auth_subject == subject)).first()

    if user is None and email and email_verified:
        # 2. One-time re-link of a pre-migration row: its auth_subject still
        # holds the retired provider's uid and its auth_issuer is NULL. Only a
        # *verified* email is proof of ownership, and only an unambiguous match
        # is adopted -- a row that already names an issuer is never re-pointed,
        # so a later subject cannot claim someone else's account.
        legacy = session.exec(
            select(User).where(
                User.auth_issuer.is_(None),
                func.lower(User.email) == email.lower(),
            )
        ).all()

        if len(legacy) == 1:
            user = legacy[0]
            user.auth_subject = subject
            user.auth_issuer = issuer
            session.add(user)
            session.commit()
            session.refresh(user)

    if user is None:
        # 3. First sign-in: provision with the default FACULTY role.
        user = User(
            email=provisioning_email(claims, subject),
            full_name=provisioning_name(claims),
            role=UserRole.FACULTY,
            auth_subject=subject,
            auth_issuer=issuer,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif email and email_verified and is_provisional_email(user.email):
        # The row was provisioned from an access token that carried no email
        # (see deps.provisioning_email). Now that the same subject has proved
        # an address, replace the placeholder. Only a placeholder is
        # overwritten -- a real stored email is never rewritten from a token.
        user.email = email
        session.add(user)
        session.commit()
        session.refresh(user)

    # Build and return user profile
    profile = get_user_profile(user, session)

    return LoginResponse(
        message="Login successful",
        user=profile,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Get the current authenticated user's profile.

    This endpoint is used by the frontend to:
    - Check if the user is authenticated
    - Get the user's current profile data
    - Determine UI based on user role

    **Authorization:** Bearer token (OIDC access token)

    **Returns:**
    - 200: User profile
    - 401: Not authenticated
    """
    return get_user_profile(current_user, session)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    current_user: User = Depends(get_current_user),
):
    """
    Logout endpoint for logging purposes.

    Note: Actual logout happens client-side with the OIDC provider.
    This endpoint is provided for:
    - Logging logout events
    - Server-side session cleanup (if implemented)
    - Future token blacklisting (if needed)

    **Authorization:** Bearer token (OIDC access token)

    **Returns:**
    - 200: Logout acknowledged
    - 401: Not authenticated
    """
    # Log the logout event (in production, you might log to analytics)
    import logging

    logger = logging.getLogger(__name__)
    logger.info("User logged out: %s", current_user.id)

    return LogoutResponse(
        message="Logout successful",
    )


@router.get("/check")
async def check_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """
    Quick auth check endpoint.

    Returns whether the provided token is valid without looking up
    the user profile. Useful for lightweight auth checks.

    **Authorization:** Optional Bearer token

    **Returns:**
    - authenticated: true/false
    - sub: the token's OIDC subject (if authenticated)
    """
    if credentials is None:
        return {"authenticated": False}

    try:
        claims = verify_bearer(credentials.credentials)
    except AuthError:
        return {"authenticated": False}

    return {
        "authenticated": True,
        "sub": claims.get("sub"),
        "email": claims.get("email"),
    }
