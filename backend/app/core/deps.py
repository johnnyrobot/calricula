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

from app.core.database import get_session
from app.core.firebase import verify_firebase_token
from app.models.user import User, UserRole

# Security scheme for Swagger UI
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
) -> User:
    """
    Authenticate the request and return the current user.

    This dependency:
    1. Extracts the Bearer token from the Authorization header
    2. Verifies the token with Firebase Admin SDK
    3. Looks up the user in our database by firebase_uid
    4. Returns the User object

    Usage:
        @router.get("/protected")
        async def protected_endpoint(current_user: User = Depends(get_current_user)):
            return {"user": current_user.email}

    Raises:
        HTTPException 401: If no token provided or token is invalid
        HTTPException 404: If user not found in database
    """
    # Check if credentials were provided
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract the token
    token = credentials.credentials

    # Verify the token with Firebase
    decoded_token = verify_firebase_token(token)
    firebase_uid = decoded_token.get("uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Look up user in database
    statement = select(User).where(User.firebase_uid == firebase_uid)
    user = session.exec(statement).first()

    if not user:
        # Auto-provision: Create new user with default FACULTY role
        email = decoded_token.get("email")
        name = decoded_token.get("name") or (email.split("@")[0] if email else "New User")

        user = User(
            email=email,
            full_name=name,
            role=UserRole.FACULTY,  # Default role
            firebase_uid=firebase_uid,
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        print(f"Auto-provisioned new user: {email} with role FACULTY")

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
