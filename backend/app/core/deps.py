"""
FastAPI Dependencies for Authentication and Authorization

Provides dependency injection for:
- get_current_user: Authenticate requests and get the current user
- require_role: Require specific user roles for endpoints
- require_roles: Allow multiple roles for endpoints
"""

from typing import List, Optional, Callable
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import get_session
from app.core.oidc import AuthError, verify_bearer
from app.models.user import User, UserRole

# Security scheme for Swagger UI
security = HTTPBearer(auto_error=False)


# Placeholder email domain for a user provisioned from a token that carries no
# usable email claim (an API access token normally carries none). `.invalid` is
# reserved by RFC 2606 and can never be delivered to; POST /api/auth/login
# replaces it with the real address once an ID token proves one.
PROVISIONAL_EMAIL_DOMAIN = "oidc.invalid"

# Display name stored when the token carries no usable name. /api/auth/login
# repairs it when an ID token later supplies one.
PROVISIONAL_FULL_NAME = "New User"

# Shared 403 text for a non-demo identity on a demo deployment. /api/auth/login
# raises it for the token's verified email, get_current_user for the stored one.
DEMO_MODE_DETAIL = (
    "Demo mode only allows access to users with 'demo' in their email address"
)


def verified_email(claims: dict) -> Optional[str]:
    """The token's email address, but only when the provider vouches for it.

    An unverified `email` claim is attacker-chosen text: at many providers a
    user can set it to anyone's address without proving control. Calricula
    stores the email on the user row and shows it to other users in workflow
    and approval responses, and matches on it when adopting a pre-migration
    row, so an unverified claim must never be used for either.
    """
    if claims.get("email_verified") is True:
        return claims.get("email")
    return None


def is_provisional_email(email: Optional[str]) -> bool:
    """True for an address this app synthesised because no email was known."""
    return bool(email) and email.endswith("@" + PROVISIONAL_EMAIL_DOMAIN)


def provisioning_email(claims: dict, subject: str) -> str:
    """The email to store for a newly provisioned user. users.email is NOT
    NULL, so a token with no verified email claim gets an undeliverable
    placeholder rather than failing the request (or storing a guess)."""
    return verified_email(claims) or f"{subject}@{PROVISIONAL_EMAIL_DOMAIN}"


def provisioning_name(claims: dict) -> str:
    """Display name from the token, falling back to the verified email's local
    part -- never to an unverified one, which is equally attacker-chosen."""
    email = verified_email(claims)
    return claims.get("name") or (email.split("@")[0] if email else PROVISIONAL_FULL_NAME)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
) -> User:
    """
    Authenticate the request and return the current user.

    This dependency:
    1. Extracts the Bearer token from the Authorization header
    2. Verifies it as an OIDC access token for this API (app/core/oidc.py),
       or as a documented dev-* token when AUTH_DEV_MODE is on
    3. Looks up the user in our database by auth_subject (the `sub` claim)
    4. Returns the User object, auto-provisioning one on first contact

    Access tokens are scoped to the API resource and carry no profile claims,
    so the email/name used when provisioning are only present for dev tokens;
    POST /api/auth/login is where an ID token supplies the real profile.

    Usage:
        @router.get("/protected")
        async def protected_endpoint(current_user: User = Depends(get_current_user)):
            return {"user": current_user.email}

    Raises:
        HTTPException 401: If no token provided or token is invalid
        HTTPException 403: In demo mode, if the subject has not signed in yet
        HTTPException 503: If no provider is configured (fails closed)
    """
    # Check if credentials were provided
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract and verify the token
    token = credentials.credentials

    try:
        claims = verify_bearer(token)
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

    # Look up user in database
    statement = select(User).where(User.auth_subject == subject)
    user = session.exec(statement).first()

    if user and settings.DEMO_MODE and "demo" not in (user.email or "").lower():
        # A demo deployment admits demo accounts only, and it re-checks on
        # every request: a row that predates DEMO_MODE (or was provisioned
        # before it was switched on) must not keep its access.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=DEMO_MODE_DETAIL,
        )

    if not user:
        # Demo mode gates who may have an account at all, and that gate lives
        # in POST /api/auth/login (which sees the ID token's verified email).
        # Provisioning here would let a protected route create the very account
        # /login just refused, so refuse instead.
        if settings.DEMO_MODE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Demo mode: demo users must sign in first",
            )

        user = User(
            email=provisioning_email(claims, subject),
            full_name=provisioning_name(claims),
            role=UserRole.FACULTY,  # Default role
            auth_subject=subject,
            auth_issuer=claims.get("iss"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """
    Like get_current_user but returns None instead of raising an error
    if the user is not authenticated. Useful for endpoints that work
    differently for authenticated vs anonymous users.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials, session)
    except HTTPException:
        return None


def require_role(required_role: UserRole) -> Callable:
    """
    Create a dependency that requires a specific user role.

    Admin users always have access regardless of the required role.

    Usage:
        @router.post("/approve")
        async def approve_course(
            current_user: User = Depends(require_role(UserRole.CURRICULUM_CHAIR))
        ):
            ...

    Args:
        required_role: The role required to access the endpoint

    Returns:
        A dependency function that validates the user's role
    """

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        # Admin always has access
        if current_user.role == UserRole.ADMIN:
            return current_user

        # Check if user has the required role
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires {required_role.value} role",
            )

        return current_user

    return role_checker


def require_roles(allowed_roles: List[UserRole]) -> Callable:
    """
    Create a dependency that requires one of several user roles.

    Admin users always have access regardless of the allowed roles.

    Usage:
        @router.get("/review-queue")
        async def get_review_queue(
            current_user: User = Depends(require_roles([
                UserRole.CURRICULUM_CHAIR,
                UserRole.ARTICULATION_OFFICER
            ]))
        ):
            ...

    Args:
        allowed_roles: List of roles that can access the endpoint

    Returns:
        A dependency function that validates the user's role
    """

    async def roles_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        # Admin always has access
        if current_user.role == UserRole.ADMIN:
            return current_user

        # Check if user has one of the allowed roles
        if current_user.role not in allowed_roles:
            roles_str = ", ".join([r.value for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of: {roles_str}",
            )

        return current_user

    return roles_checker


def require_admin() -> Callable:
    """
    Convenience dependency for admin-only endpoints.

    Usage:
        @router.delete("/users/{id}")
        async def delete_user(
            user_id: uuid.UUID,
            current_user: User = Depends(require_admin())
        ):
            ...
    """
    return require_role(UserRole.ADMIN)


def require_reviewer() -> Callable:
    """
    Convenience dependency for endpoints accessible to reviewers
    (Curriculum Chair, Articulation Officer, or Admin).
    """
    return require_roles([
        UserRole.CURRICULUM_CHAIR,
        UserRole.ARTICULATION_OFFICER,
    ])
